import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
Add a flowchart for every question where a process, hierarchy, cycle, or cause–effect exists.

### Value Addition
- 3–6 keywords / thinkers / report names / examples for enrichment

---

## Global rules
- Prefer **Q&A + framework** over long essays.
- Remove fluff and repetition; NEVER drop facts, dates, figures, or scheme names.
- Cover the ENTIRE source from start to end. If output space runs out, end at a clean ## Q boundary so a continuation can finish remaining topics — never stop mid-sentence or mid-table.
- Use comparison tables for Pros/Cons, Centre vs State, Old vs New, India vs Global, etc.
- Do not invent data.
- No meta-commentary about summarising.
- When asked to CONTINUE, resume with the next ## Q{n} and finish every remaining topic. Do not repeat earlier questions.`;

const CONTINUE_PROMPT = `Your previous output was cut off due to length limits. Continue the UPSC Mains Q&A revision notes from EXACTLY where you stopped.

Rules:
- Do NOT repeat the title or any completed ## Q sections already written.
- Continue with the next question number after the last complete Q in the prior text.
- Cover ALL remaining source topics until the document is fully covered.
- Keep the same Markdown structure (Answer Framework, Core Points, Data & Facts, Memory Cue, Flowchart, Value Addition).
- End only when the full source is covered.`;

function extractMessageText(message: {
  content?: string | null;
  reasoning?: string | null;
} | null | undefined): string {
  const content = message?.content?.trim();
  if (content) return content;

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

function looksIncomplete(markdown: string): boolean {
  const trimmed = markdown.trim();
  if (!trimmed) return true;
  // Unclosed code fence (flowchart cut mid-way)
  if ((trimmed.match(/```/g) || []).length % 2 === 1) return true;
  // Ends mid-punctuation / mid-arrow (hard cut)
  const last = trimmed.slice(-60);
  if (/(?:→|->|,|:|\|\s*)$/.test(last)) return true;
  return false;
}

function mergeContinuation(base: string, cont: string): string {
  let extra = cont.trim();
  // Drop accidental repeated H1
  extra = extra.replace(/^#\s+[^\n]+\n+/, "");
  return `${base.trimEnd()}\n\n${extra}`.trim();
}

/** Split long source into overlapping parts so every section is covered. */
function splitSource(text: string, chunkSize = 45_000, overlap = 2_000): string[] {
  if (text.length <= chunkSize) return [text];

  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      // Prefer break at paragraph
      const window = text.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (breakAt > chunkSize * 0.6) {
        end = start + breakAt + 1;
      }
    }
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return parts.filter(Boolean);
}

async function generateOnce(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
) {
  return client.chat.completions.create({
    model,
    temperature: 0.25,
    max_tokens: 16000,
    messages,
  });
}

/**
 * Generate notes and auto-continue when the model hits the token limit,
 * so the last sections are never dropped.
 */
async function generateCompleteNotes(
  client: OpenAI,
  model: string,
  fileName: string,
  sourceText: string,
  partLabel?: string
): Promise<{ markdown: string; continued: number }> {
  const partNote = partLabel
    ? `\n\n(This is ${partLabel} of a longer document. Cover THIS part fully with Q&As. Number questions continuing naturally.)`
    : "";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Create UPSC Mains Q&A quick-revision notes from this source. Cover EVERY topic in the source — do not stop early.${partNote}\n\nSource file: ${fileName}\n\nSource text:\n\n${sourceText}`,
    },
  ];

  let markdown = "";
  let continued = 0;
  const MAX_CONTINUES = 5;

  for (let attempt = 0; attempt <= MAX_CONTINUES; attempt += 1) {
    const completion = await generateOnce(client, model, messages);
    const choice = completion.choices[0];
    const piece = extractMessageText(choice?.message);
    const finish = String(choice?.finish_reason || "");

    if (!piece && !markdown) {
      throw Object.assign(new Error("The AI returned an empty summary."), {
        status: 502,
      });
    }

    markdown = markdown ? mergeContinuation(markdown, piece) : piece;

    // Continue when the model hit the output token limit or markup is clearly cut off
    const hitLimit = finish === "length" || finish === "max_tokens";
    const shouldContinue =
      hitLimit || (looksIncomplete(markdown) && attempt < 2);

    if (!shouldContinue || attempt === MAX_CONTINUES) {
      break;
    }

    continued += 1;
    messages.push({ role: "assistant", content: piece || markdown.slice(-6000) });
    messages.push({
      role: "user",
      content: `${CONTINUE_PROMPT}\n\n---\nLast 1500 characters you already wrote (for continuity only — do not repeat):\n${markdown.slice(-1500)}`,
    });
  }

  return { markdown, continued };
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

    // Keep almost all source text; only hard-cap pathological sizes
    const MAX_CHARS = 250_000;
    const promptText =
      text.length > MAX_CHARS
        ? text.slice(0, MAX_CHARS)
        : text;

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 180_000,
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "PDF2Notes Pro",
      },
    });

    const chunks = splitSource(promptText);
    const parts: string[] = [];
    let totalContinued = 0;

    for (let i = 0; i < chunks.length; i += 1) {
      const label =
        chunks.length > 1 ? `part ${i + 1} of ${chunks.length}` : undefined;
      const { markdown, continued } = await generateCompleteNotes(
        client,
        model,
        fileName,
        chunks[i],
        label
      );
      totalContinued += continued;

      if (chunks.length > 1) {
        // Renumber-ish: keep content; strip duplicate H1 after first part
        if (i === 0) parts.push(markdown);
        else parts.push(markdown.replace(/^#\s+[^\n]+\n+/, "").trim());
      } else {
        parts.push(markdown);
      }
    }

    let markdown = parts.join("\n\n---\n\n").trim();

    // Ensure trailing incomplete fence is closed so PDF parser keeps last diagram
    if ((markdown.match(/```/g) || []).length % 2 === 1) {
      markdown += "\n```";
    }

    if (!markdown) {
      return NextResponse.json(
        { error: "The AI returned an empty summary. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      markdown,
      model,
      continued: totalContinued,
      parts: chunks.length,
      sourceChars: promptText.length,
      truncatedSource: text.length > MAX_CHARS,
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
