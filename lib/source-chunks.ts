/**
 * Split long source text into chunks for sequential /api/condense calls
 * (avoids Vercel FUNCTION_INVOCATION_TIMEOUT).
 */
export function splitSourceChunks(
  text: string,
  chunkSize = 26_000,
  overlap = 800
): string[] {
  const t = text.trim();
  if (t.length <= chunkSize) return [t];

  const parts: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + chunkSize, t.length);
    if (end < t.length) {
      const window = t.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (breakAt > chunkSize * 0.55) end = start + breakAt + 1;
    }
    parts.push(t.slice(start, end).trim());
    if (end >= t.length) break;
    start = Math.max(0, end - overlap);
  }
  return parts.filter(Boolean);
}

export function mergeNoteParts(base: string, next: string): string {
  let extra = next.trim();
  extra = extra.replace(/^#\s+[^\n]+\n+/, "");
  if (!base.trim()) return next.trim();
  return `${base.trimEnd()}\n\n${extra}`.trim();
}
