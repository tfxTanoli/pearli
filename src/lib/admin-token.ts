/**
 * Tidies an admin password that was copied from a chat or an email. Those add
 * things the eye can't see or wouldn't notice: spaces and line breaks,
 * invisible characters, a typographic dash in place of "-", quotes around the
 * text. Browsers refuse to send such characters in a request header (Safari
 * reports only "Type error").
 *
 * Rather than list every character an app might add, this keeps only what a
 * password can contain (printable ASCII) and drops the rest.
 */
export function cleanAdminToken(raw: string): string {
  return (
    raw
      // Full-width and other look-alike forms back to plain letters, digits, "-" and "_".
      .normalize("NFKC")
      // Typographic hyphens and dashes (U+2010 to U+2015, minus sign, small and
      // full-width hyphens) back to the plain "-" the password uses.
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
      // Everything that is not printable ASCII: spaces, line breaks, invisible
      // characters, curly quotes, emoji, other alphabets.
      .replace(/[^\x21-\x7E]/g, "")
      // Straight quotes and backticks that get copied along with the password.
      .replace(/["'`]/g, "")
  );
}

/**
 * The unusual characters in what was entered, as code points such as "U+200B",
 * so a failed unlock can say what was removed. Ordinary spaces and line breaks
 * are not reported.
 */
export function unusualCharacters(raw: string): string[] {
  const found = new Set<string>();
  for (const character of raw) {
    if (/[\x20-\x7E\t\n\r]/.test(character)) continue;
    const code = character.codePointAt(0) ?? 0;
    found.add(`U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
  }
  return [...found];
}
