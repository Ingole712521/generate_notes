import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NotesPdfDocument } from "@/lib/NotesPdfDocument";
import { extractTitle } from "@/lib/markdown-to-blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileName(name: string): string {
  return name
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const markdown = typeof body?.markdown === "string" ? body.markdown.trim() : "";
    const sourceFileName =
      typeof body?.fileName === "string" ? body.fileName : undefined;

    if (!markdown) {
      return NextResponse.json(
        { error: "No markdown content provided for PDF export." },
        { status: 400 }
      );
    }

    const element = React.createElement(NotesPdfDocument, {
      markdown,
      sourceFileName,
    });

    // @react-pdf/renderer expects a React element; cast for renderToBuffer typing
    const buffer = await renderToBuffer(element as React.ReactElement);

    const title = extractTitle(markdown);
    const downloadName = `${safeFileName(title) || "notes"}-pdf2notes.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export-pdf]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate PDF. Please try again.",
      },
      { status: 500 }
    );
  }
}
