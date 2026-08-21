/**
 * Standard competitive-judge output normalization: ignore trailing
 * whitespace per line, CRLF vs LF, and a trailing blank line/newline —
 * everything else must match exactly.
 */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
