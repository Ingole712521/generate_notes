/**
 * Markdown → blocks for UPSC Mains revision PDFs.
 * Supports headings, lists, tables, blockquotes (memory cues), and fenced flowcharts.
 */

export type InlineSeg =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

export type MdBlock =
  | { type: "h1" | "h2" | "h3" | "h4"; content: InlineSeg[] }
  | { type: "p"; content: InlineSeg[] }
  | { type: "ul" | "ol"; items: InlineSeg[][] }
  | { type: "table"; headers: InlineSeg[][]; rows: InlineSeg[][][] }
  | { type: "hr" }
  | { type: "callout"; variant: CalloutVariant; content: InlineSeg[][]; title?: string }
  | { type: "flowchart"; lines: string[] };

export type CalloutVariant = "memory" | "framework" | "data" | "note" | "default";

function parseInline(text: string): InlineSeg[] {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/\*\*\s+/g, "**")
    .replace(/\s+\*\*/g, "**")
    .replace(/__([^_]+)__/g, "**$1**");

  const segs: InlineSeg[] = [];
  const re = /(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(normalized)) !== null) {
    if (m.index > last) {
      segs.push({ type: "text", value: normalized.slice(last, m.index) });
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

  if (last < normalized.length) {
    segs.push({ type: "text", value: normalized.slice(last) });
  }

  return segs.length ? segs : [{ type: "text", value: normalized }];
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

function detectCalloutVariant(text: string): { variant: CalloutVariant; title?: string } {
  const lower = text.toLowerCase();
  if (/memory\s*cue|mnemonic|hook/.test(lower)) {
    return { variant: "memory", title: "Memory Cue" };
  }
  if (/answer\s*framework|answering\s*framework|structure\s*of\s*answer/.test(lower)) {
    return { variant: "framework", title: "Answer Framework" };
  }
  if (/data\s*bank|key\s*data|facts?\s*&?\s*figures|statistics/.test(lower)) {
    return { variant: "data", title: "Data & Facts" };
  }
  if (/value\s*addition|keywords?|pyq/.test(lower)) {
    return { variant: "note", title: "Value Addition" };
  }
  return { variant: "default" };
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

    // Fenced code / flowchart
    if (trimmed.startsWith("```")) {
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i].replace(/\t/g, "  "));
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({
        type: "flowchart",
        lines: codeLines.length ? codeLines : ["(empty flowchart)"],
      });
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4;
      const tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      blocks.push({ type: tag, content: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // Blockquote → callout (memory cue / notes)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      const joined = quoteLines.join(" ");
      const { variant, title } = detectCalloutVariant(joined);
      blocks.push({
        type: "callout",
        variant,
        title,
        content: quoteLines.map((l) => parseInline(l)),
      });
      continue;
    }

    // Table
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1].trim())
    ) {
      const headers = splitTableRow(trimmed).map(parseInline);
      i += 2;
      const rows: InlineSeg[][][] = [];
      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        !isSeparatorRow(lines[i].trim())
      ) {
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

    // Paragraph
    const paraLines: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^---+$/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("```") &&
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

export function extractTitle(
  markdown: string,
  fallback = "UPSC Mains Quick Revision"
): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].replace(/\*\*/g, "").trim() : fallback;
}
