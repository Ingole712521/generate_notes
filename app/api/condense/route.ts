import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an expert academic summarizer.

Task: Condense the provided educational text into a hyper-structured, clear summary. Retain ALL critical data points, percentages, historical dates, and specific scheme names. Format the response strictly using Markdown (Headings, Bold key terms, Tables for comparisons, and Bullet points). The output must be optimized to fit 2 standard A4 pages when rendered.

Constraint: Remove fluff, repetitive explanations, and conversational filler. Prioritize key definitions, formulas, lists, and conclusions.

Additional formatting rules:
- Start with a single H1 title that captures the document topic.
- Use H2/H3 for sections.
- Prefer compact bullet lists over long paragraphs.
- Use Markdown tables when comparing items, schemes, or options.
- Bold important terms, figures, dates, and named schemes on first mention.
- Do not wrap the entire response in a code fence.
- Do not include meta-commentary about the summarization process.
- Put the final summary in your message content (not only in internal reasoning).`;

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

    // Keep prompts bounded so free/slow models finish within a minute
    const MAX_CHARS = 80_000;
    const promptText = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[Truncated]` : text;

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
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Source file: ${fileName}\n\nEducational text to condense:\n\n${promptText}`,
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
