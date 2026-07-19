import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby-safe: keep each invocation under Vercel's limit (avoid FUNCTION_INVOCATION_TIMEOUT) */
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert UPSC Civil Services (Mains) mentor and notes-maker.

Task: Convert the provided educational / GS text into a QUICK-REVISION sheet in Question–Answer format for UPSC Mains. Retain ALL critical data, years, committees, articles, judgments, schemes, and reports.

Output Markdown only (do not wrap the whole response in a code fence).

# {Topic} — UPSC Mains Quick Revision

For EACH probable Mains question use:

## Q{n}. {Realistic Mains question?}

### Answer Framework
1. Introduction 2. Body (multi-dimensional) 3. Challenges 4. Way Forward 5. Conclusion

### Core Points
- Crisp bullets with bold key terms, articles, schemes, cases

### Data & Facts
| Indicator / Fact | Figure / Detail | Source / Year |

### Memory Cue
> **Memory Cue:** short mnemonic

### Flowchart
\`\`\`flowchart
TITLE: name
CHAIN: A → B → C
BOX: Section | Item1 | Item2
\`\`\`
Use Unicode → and ASCII % only.

### Value Addition
- 3–6 keywords / reports / examples

Rules: No fluff; never invent data; cover the provided source fully for this request; if you must stop early, end on a complete ## Q section. When asked to CONTINUE, do not repeat prior Qs.`;

const CONTINUE_PROMPT = `Continue the UPSC Mains Q&A notes from where you stopped.
- Do NOT repeat the H1 or completed ## Q sections.
- Next question number after the last Q.
- Same Markdown structure (Framework, Core Points, Data, Memory Cue, Flowchart, Value Addition).
- Cover remaining topics in the source for this request.`;

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
    return "Failed to generate notes with the AI service.";
  }
  const err = error as {
    message?: string;
    status?: number;
    error?: { message?: string };
  };
  const apiMsg = err.error?.message || err.message || "AI request failed.";

  if (err.status === 401 || /unauthorized|invalid.*key|user not found/i.test(apiMsg)) {
    return "OpenRouter API key is invalid. Check OPENAI_API_KEY in Vercel env vars.";
  }
  if (err.status === 402 || /credits|payment|insufficient/i.test(apiMsg)) {
    return "OpenRouter account has insufficient credits for this model.";
  }
  if (err.status === 429 || /rate.?limit/i.test(apiMsg)) {
    return "Rate limited by OpenRouter. Wait a moment and try again.";
  }
  if (/timeout|ETIMEDOUT|aborted/i.test(apiMsg)) {
    return "AI call timed out. Try a faster model (e.g. deepseek/deepseek-v4-flash) or a shorter PDF.";
  }
  return apiMsg;
}

function looksIncomplete(markdown: string, finish: string): boolean {
  if (finish === "length" || finish === "max_tokens") return true;
  const t = markdown.trim();
  if (!t) return true;
  if ((t.match(/```/g) || []).length % 2 === 1) return true;
  if (/(?:→|->|,|:|\|\s*)$/.test(t.slice(-40))) return true;
  return false;
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
            "API key is not configured. Set OPENAI_API_KEY in Vercel Project → Settings → Environment Variables.",
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName : "document.pdf";
    const mode = body?.mode === "continue" ? "continue" : "start";
    const priorMarkdown =
      typeof body?.priorMarkdown === "string" ? body.priorMarkdown.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "No text provided to condense." }, { status: 400 });
    }
    if (mode === "continue" && !priorMarkdown) {
      return NextResponse.json(
        { error: "priorMarkdown is required when mode=continue." },
        { status: 400 }
      );
    }

    const baseURL = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENAI_MODEL || "deepseek/deepseek-v4-flash";

    // Keep each serverless call small/fast for Vercel
    const MAX_CHARS = 28_000;
    const promptText =
      text.length > MAX_CHARS
        ? `${text.slice(0, MAX_CHARS)}\n\n[End of this chunk — cover all of the above fully.]`
        : text;

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 50_000,
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://pdf2notes-pro.vercel.app",
        "X-Title": process.env.OPENROUTER_APP_NAME || "PDF2Notes Pro",
      },
    });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] =
      mode === "continue"
        ? [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Source file: ${fileName}\n\nSource chunk:\n\n${promptText}`,
            },
            {
              role: "assistant",
              content: priorMarkdown.slice(-8000),
            },
            {
              role: "user",
              content: `${CONTINUE_PROMPT}\n\nLast 1200 chars already written:\n${priorMarkdown.slice(-1200)}`,
            },
          ]
        : [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Create UPSC Mains Q&A quick-revision notes for this source chunk.\n\nSource file: ${fileName}\n\nSource text:\n\n${promptText}`,
            },
          ];

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.25,
      max_tokens: 4096,
      messages,
    });

    const choice = completion.choices[0];
    let markdown = extractMessageText(choice?.message);
    const finish = String(choice?.finish_reason || "");

    if (!markdown) {
      return NextResponse.json(
        {
          error: finish
            ? `Empty AI response (finish_reason: ${finish}). Try deepseek/deepseek-v4-flash.`
            : "Empty AI response. Please try again.",
        },
        { status: 502 }
      );
    }

    if ((markdown.match(/```/g) || []).length % 2 === 1) {
      markdown += "\n```";
    }

    const incomplete = looksIncomplete(markdown, finish);

    return NextResponse.json({
      success: true,
      markdown,
      incomplete,
      finishReason: finish || null,
      model,
      mode,
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
