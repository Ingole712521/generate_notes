import { extractTitle } from "./markdown-to-blocks";

/** Split when notes exceed this size so each PDF stays complete. */
export const SPLIT_THRESHOLD_CHARS = 7_500;

export type NotesParts = {
  needsSplit: boolean;
  part1: string;
  part2: string | null;
  questionCount: number;
  title: string;
};

export function splitNotesForPdf(markdown: string): NotesParts {
  const trimmed = markdown.trim();
  const title = extractTitle(trimmed);
  const qMatches = Array.from(trimmed.matchAll(/^##\s+(Q\d*\.?[^\n]*)$/gim));

  if (trimmed.length < SPLIT_THRESHOLD_CHARS || qMatches.length < 2) {
    return {
      needsSplit: false,
      part1: trimmed,
      part2: null,
      questionCount: qMatches.length,
      title,
    };
  }

  const midIndex = Math.ceil(qMatches.length / 2);
  const splitAt = qMatches[midIndex]?.index;
  const h1 = extractH1Block(trimmed);

  if (splitAt == null || splitAt <= 0) {
    const mid = Math.floor(trimmed.length / 2);
    const nearby = trimmed.indexOf("\n\n", mid);
    const at = nearby > 0 ? nearby : mid;
    return {
      needsSplit: true,
      part1: withPartBanner(trimmed.slice(0, at).trim(), title, 1, 2),
      part2: withPartBanner(ensureTitle(trimmed.slice(at).trim(), h1), title, 2, 2),
      questionCount: qMatches.length,
      title,
    };
  }

  return {
    needsSplit: true,
    part1: withPartBanner(trimmed.slice(0, splitAt).trim(), title, 1, 2),
    part2: withPartBanner(
      ensureTitle(trimmed.slice(splitAt).trim(), h1),
      title,
      2,
      2
    ),
    questionCount: qMatches.length,
    title,
  };
}

function extractH1Block(markdown: string): string {
  const m = /^(#\s+[^\n]+(?:\n+[^\n#][^\n]*)?)/m.exec(markdown);
  return m ? m[1].trim() : `# ${extractTitle(markdown)}`;
}

function ensureTitle(part: string, h1: string): string {
  if (/^#\s+/m.test(part)) return part;
  return `${h1}\n\n${part}`;
}

function withPartBanner(
  content: string,
  title: string,
  part: number,
  total: number
): string {
  const banner = `> **PDF ${part} of ${total}** — ${title} (complete set = Part 1 + Part 2)`;
  if (/^#\s+/m.test(content)) {
    return content.replace(/^(#\s+[^\n]+\n+)/, `$1${banner}\n\n`);
  }
  return `${banner}\n\n${content}`;
}
