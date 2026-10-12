/**
 * Tidies an admin password that was copied from a chat or an email. Those add
 * things the eye can't see or wouldn't notice: spaces and line breaks,
 * invisible characters, a typographic dash in place of "-", quotes around the
 * text. Browsers refuse to send such characters in a request header (Safari
 * reports only "Type error"), so they are removed or put right here first.
 *
 * The characters are written as escape codes on purpose: several are invisible.
 */
export function cleanAdminToken(raw: string): string {
  return (
    raw
      // Typographic hyphens and dashes (U+2010 to U+2015, minus sign, small and
      // full-width hyphens) back to the plain "-" the password uses.
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
      // Whitespace of any kind, plus invisible characters: soft hyphen, zero-width
      // spaces and joiners, direction marks, word joiner, byte-order mark.
      .replace(/[\s\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
      // Straight, curly and angle quotes that get copied along with the password.
      .replace(/["'`\u2018\u2019\u201C\u201D\u00AB\u00BB]/g, "")
  );
}

/** True when every character can travel in a request header (printable ASCII only). */
export function isSendableToken(token: string): boolean {
  return /^[\x21-\x7E]+$/.test(token);
}
