import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NotesPdfDocument } from "@/lib/NotesPdfDocument";
import { extractTitle } from "@/lib/markdown-to-blocks";
import { splitNotesForPdf } from "@/lib/split-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeFileName(name: string): string {
  return name
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

async function renderPdf(
  markdown: string,
  sourceFileName?: string,
  partLabel?: string
): Promise<Buffer> {
  const element = React.createElement(NotesPdfDocument, {
    markdown,
    sourceFileName,
    partLabel,
  });
  return renderToBuffer(element as React.ReactElement);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const markdown = typeof body?.markdown === "string" ? body.markdown.trim() : "";
    const sourceFileName =
      typeof body?.fileName === "string" ? body.fileName : undefined;
    const part = typeof body?.part === "string" ? body.part : "auto";

    if (!markdown) {
      return NextResponse.json(
        { error: "No markdown content provided for PDF export." },
        { status: 400 }
      );
    }

    const split = splitNotesForPdf(markdown);
    const baseTitle = safeFileName(split.title) || "upsc-notes";

    // Bundle both PDFs (sequential render — one response, still under 60s for typical notes)
    if (part === "all") {
      if (!split.needsSplit || !split.part2) {
        const buffer = await renderPdf(split.part1, sourceFileName);
        return NextResponse.json({
          split: false,
          files: [
            {
              name: `${baseTitle}-pdf2notes.pdf`,
              base64: Buffer.from(buffer).toString("base64"),
            },
          ],
        });
      }

      const buf1 = await renderPdf(split.part1, sourceFileName, "Part 1 of 2");
      const buf2 = await renderPdf(split.part2, sourceFileName, "Part 2 of 2");

      return NextResponse.json({
        split: true,
        questionCount: split.questionCount,
        files: [
          {
            name: `${baseTitle}-part1-of-2.pdf`,
            base64: Buffer.from(buf1).toString("base64"),
            label: "Part 1 of 2",
          },
          {
            name: `${baseTitle}-part2-of-2.pdf`,
            base64: Buffer.from(buf2).toString("base64"),
            label: "Part 2 of 2",
          },
        ],
      });
    }

    let content = split.part1;
    let partLabel: string | undefined;
    let downloadName = `${baseTitle}-pdf2notes.pdf`;

    if (part === "2") {
      if (!split.part2) {
        return NextResponse.json(
          { error: "Notes fit in one PDF — there is no Part 2." },
          { status: 400 }
        );
      }
      content = split.part2;
      partLabel = "Part 2 of 2";
      downloadName = `${baseTitle}-part2-of-2.pdf`;
    } else if (part === "1" || (part === "auto" && split.needsSplit)) {
      content = split.part1;
      if (split.needsSplit) {
        partLabel = "Part 1 of 2";
        downloadName = `${baseTitle}-part1-of-2.pdf`;
      }
    }

    const buffer = await renderPdf(content, sourceFileName, partLabel);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "no-store",
        "X-PDF-Split": split.needsSplit ? "true" : "false",
        "X-PDF-Title": extractTitle(content),
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
