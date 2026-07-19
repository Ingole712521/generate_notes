import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an expert UPSC Civil Services (Mains) mentor and notes-maker.

Task: Convert the provided educational / GS text into a QUICK-REVISION sheet in Question–Answer format, optimized for UPSC Mains answer writing. Retain ALL critical data points, percentages, years, committees, articles, judgments, schemes, reports, and named institutions.

Output MUST be Markdown only (no code fence wrapping the whole response). Put the final notes in message content.

## Document structure (follow strictly)

# {Topic} — UPSC Mains Quick Revision

Brief 2–3 line syllabus mapping / why this topic matters for Mains (GS paper if clear).

Then create **multiple probable Mains questions** covering the FULL source (do not stop early). For EACH question use this exact subsection pattern:

## Q{n}. {Write a realistic UPSC Mains-style question ending with ?}

### Answer Framework
Numbered exam-ready structure, e.g.:
1. **Introduction** — definition / context / latest data hook
2. **Body** — multi-dimensional analysis (constitutional / institutional / social / economic / ethical / federal as relevant)
3. **Challenges / Issues**
4. **Way Forward** — actionable, specific
5. **Conclusion** — balanced, forward-looking (1–2 lines)

### Core Points (write these under the framework)
- Crisp bullets a candidate can expand into 150/250-word answers
- Include constitutional articles, committees, SC cases, schemes where relevant
- Bold key terms on first mention

### Data & Facts
Markdown table when numbers/comparisons exist:
| Indicator / Fact | Figure / Detail | Source / Year |
|---|---|---|
Keep every important statistic from the source.

### Memory Cue
> **Memory Cue:** Short mnemonic / acronym / story hook to recall the answer skeleton in the exam hall.

### Flowchart
ALWAYS use this exact machine-readable format inside a fenced block (so PDF can draw boxes + arrows). Do NOT use plain paragraphs or asterisk separators.

\`\`\`flowchart
TITLE: Short diagram name
CHAIN: Node A → Node B → Node C
CHAIN: Alternate path X → Y → Z
BOX: Section name | Item 1 | Item 2 | Item 3
BOX: Another section | Point 1 | Point 2
\`\`\`

Rules for flowcharts:
- Use the Unicode arrow → between nodes on CHAIN lines (never apostrophes or quotes as arrows).
- Use ASCII % for percentages (e.g. 4-6%, never special glyphs).
- Prefer 1 TITLE, 1–3 CHAIN lines, and 1–3 BOX lines.
- Example:
\`\`\`flowchart
TITLE: Inflation-Growth Nexus
CHAIN: Moderate Inflation (4-6%) → Consumption ↑ → GDP ↑
CHAIN: High Inflation (>6%) → Purchasing Power ↓ → GDP ↓
BOX: MPC Tools | Repo Rate | Forward Guidance | Macroprudential Measures
BOX: Challenges | Global shocks | Supply-chain disruptions | Transmission lag
BOX: Way Forward | Data-driven decisions | Forward guidance | Macroprudential tools
\`\`\`
Add a flowchart for every question where a process, hierarchy, cycle, or cause–effect exists.

### Value Addition
- 3–6 keywords / thinkers / report names / examples for enrichment
- Optional: 1 linked PYQ theme if obvious from content

---

## Global rules
- Prefer **Q&A + framework** over long essays.
- Remove fluff and repetition; NEVER drop facts, dates, figures, or scheme names.
- If source is long, add more Qs (Q1, Q2, Q3…) until the whole document is covered.
- Use comparison tables for Pros/Cons, Centre vs State, Old vs New, India vs Global, etc.
- Hindi terms only if present in source; otherwise English.
- Do not invent data. If a figure is approximate in source, keep it as given.
- No meta-commentary about summarising.`;

function extractMessageText(message: {
  content?: string | null;
  reasoning?: string | null;
} | null | undefined): string {
  const content = message?.content?.trim();
  if (content) return content;

  // Some OpenRouter reasoning models occasionally leave content empty
  const reasoning = message?.reasoning?.trim();
  if (reasoning && /^#\s/m.test(reasoning)) return reasoning;

  return "";
}

function openRouterErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Failed to condense text with the AI service.";
  }

  const err = error as {
    message?: string;
    status?: number;
    error?: { message?: string; code?: string; metadata?: unknown };
  };

  const apiMsg = err.error?.message || err.message;
  if (!apiMsg) return "Failed to condense text with the AI service.";

  if (err.status === 401 || /user not found|invalid.*key|unauthorized/i.test(apiMsg)) {
    return "OpenRouter API key is invalid. Check OPENAI_API_KEY in .env.local.";
  }
  if (err.status === 402 || /credits|payment|insufficient/i.test(apiMsg)) {
    return "OpenRouter account has insufficient credits for this model.";
  }
  if (err.status === 429 || /rate.?limit/i.test(apiMsg)) {
    return "Rate limited by OpenRouter. Wait a moment and try again (free models are often busy).";
  }
  if (/model.*not found|no endpoints/i.test(apiMsg)) {
    return `Model unavailable: ${process.env.OPENAI_MODEL || "unknown"}. Try deepseek/deepseek-v4-flash in .env.local.`;
  }

  return apiMsg;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (
      !apiKey ||
      apiKey.includes("your-openai-api-key") ||
      apiKey.includes("your-key-here")
    ) {
      return NextResponse.json(
        {
          error:
            "API key is not configured. Add OPENAI_API_KEY to your .env.local file (OpenRouter or OpenAI).",
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName : "document.pdf";

    if (!text) {
      return NextResponse.json(
        { error: "No text provided to condense." },
        { status: 400 }
      );
    }

    const baseURL =
      process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENAI_MODEL || "deepseek/deepseek-v4-flash";

    // Bound extremely large pastes; keep as much source as practical
    const MAX_CHARS = 150_000;
    const promptText =
      text.length > MAX_CHARS
        ? `${text.slice(0, MAX_CHARS)}\n\n[Source truncated due to length — cover all content provided above with multiple Q&As.]`
        : text;

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 110_000,
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "PDF2Notes Pro",
      },
    });

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.25,
      max_tokens: 12000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Create UPSC Mains Q&A quick-revision notes from this source.\n\nSource file: ${fileName}\n\nSource text:\n\n${promptText}`,
        },
      ],
    });

    const choice = completion.choices[0];
    const markdown = extractMessageText(choice?.message);

    if (!markdown) {
      const finish = choice?.finish_reason;
      return NextResponse.json(
        {
          error: finish
            ? `The AI returned an empty summary (finish_reason: ${finish}). Try another model such as deepseek/deepseek-v4-flash.`
            : "The AI returned an empty summary. Please try again or switch models.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      markdown,
      model,
      usage: completion.usage ?? null,
    });
  } catch (error: unknown) {
    console.error("[condense]", error);

    const message = openRouterErrorMessage(error);

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
