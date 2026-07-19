/**
 * Fix common AI/PDF encoding glitches (%, en-dash, arrows mangled as Latin-1).
 */
export function sanitizePdfText(input: string): string {
  return (
    input
      // Mojibake for % and related
      .replace(/Â%/g, "%")
      .replace(/â€¯/g, " ")
      .replace(/â€“/g, "–")
      .replace(/â€”/g, "—")
      .replace(/â†’/g, "→")
      .replace(/â†“/g, "↓")
      .replace(/Ã—/g, "×")
      // Lone Â often stood for % when UTF-8 percent was mis-decoded
      .replace(/(\d)\s*Â(?!\w)/g, "$1%")
      .replace(/Â(?=\s|$|,|\.|\)|;)/g, "%")
      // Broken arrow substitutes seen in exports
      .replace(/\s*''\s*/g, " → ")
      .replace(/\s*'\s*(?=[A-Z])/g, " → ")
      .replace(/\s*->\s*/g, " → ")
      .replace(/\s*=>\s*/g, " → ")
      .replace(/\s*>\s*(?=[A-Za-z(])/g, " → ")
      // Cleanup
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );
}

export function sanitizeLines(lines: string[]): string[] {
  return lines.map((l) => sanitizePdfText(l)).filter((l) => l.length > 0);
}
