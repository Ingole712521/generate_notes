/**
 * Lightweight Markdown → structured blocks for @react-pdf/renderer.
 * Supports headings, paragraphs, lists, bold/italic inline, and GFM tables.
 */

export type InlineSeg =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

export type MdBlock =
  | { type: "h1" | "h2" | "h3"; content: InlineSeg[] }
  | { type: "p"; content: InlineSeg[] }
  | { type: "ul" | "ol"; items: InlineSeg[][] }
  | { type: "table"; headers: InlineSeg[][]; rows: InlineSeg[][][] }
  | { type: "hr" };

function parseInline(text: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segs.push({ type: "text", value: text.slice(last, m.index) });
    }
    const token = m[0];
    if (token.startsWith("**")) {
      segs.push({ type: "bold", value: token.slice(2, -2) });
    } else if (token.startsWith("*")) {
      segs.push({ type: "italic", value: token.slice(1, -1) });
    } else if (token.startsWith("`")) {
      segs.push({ type: "code", value: token.slice(1, -1) });
    }
    last = m.index + token.length;
  }

  if (last < text.length) {
    segs.push({ type: "text", value: text.slice(last) });
  }

  return segs.length ? segs : [{ type: "text", value: text }];
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

export function parseMarkdownToBlocks(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({
        type: (`h${level}` as "h1" | "h2" | "h3"),
        content: parseInline(heading[2]),
      });
      i += 1;
      continue;
    }

    // Table: header + separator + rows
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1].trim())
    ) {
      const headers = splitTableRow(trimmed).map(parseInline);
      i += 2;
      const rows: InlineSeg[][][] = [];
      while (i < lines.length && lines[i].trim().includes("|") && !isSeparatorRow(lines[i].trim())) {
        rows.push(splitTableRow(lines[i].trim()).map(parseInline));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: InlineSeg[][] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^[-*+]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: InlineSeg[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^\d+\.\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph (merge consecutive non-empty, non-special lines)
    const paraLines: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^---+$/.test(lines[i].trim()) &&
      !(
        lines[i].trim().includes("|") &&
        i + 1 < lines.length &&
        isSeparatorRow(lines[i + 1]?.trim() ?? "")
      )
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", content: parseInline(paraLines.join(" ")) });
  }

  return blocks;
}

export function extractTitle(markdown: string, fallback = "Condensed Notes"): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].replace(/\*\*/g, "").trim() : fallback;
}
