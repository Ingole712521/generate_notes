import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

async function extractPdfText(buffer: Buffer) {
  // Import the implementation directly to avoid pdf-parse's test-file side effect in Next.js
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    data: Buffer
  ) => Promise<{ text: string; numpages: number }>;
  return pdfParse(buffer);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No PDF file provided. Please upload a .pdf file." },
        { status: 400 }
      );
    }

    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Unsupported file type. Only PDF files are accepted." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "File must have a .pdf extension." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 10MB size limit." },
        { status: 413 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = await extractPdfText(buffer);
    } catch {
      return NextResponse.json(
        {
          error:
            "Could not parse this PDF. It may be corrupted, password-protected, or image-only (scanned).",
        },
        { status: 422 }
      );
    }

    const text = (parsed.text || "").replace(/\u0000/g, "").trim();

    if (!text || text.length < 40) {
      return NextResponse.json(
        {
          error:
            "Little or no extractable text found. Scanned/image-only PDFs are not supported without OCR.",
        },
        { status: 422 }
      );
    }

    // Cap extremely long documents to keep AI calls manageable
    const MAX_CHARS = 120_000;
    const truncated = text.length > MAX_CHARS;
    const extractedText = truncated ? text.slice(0, MAX_CHARS) : text;

    return NextResponse.json({
      success: true,
      fileName: file.name,
      pageCount: parsed.numpages ?? null,
      characterCount: extractedText.length,
      truncated,
      text: extractedText,
    });
  } catch (error) {
    console.error("[upload]", error);
    return NextResponse.json(
      { error: "Unexpected error while processing the upload." },
      { status: 500 }
    );
  }
}
