// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanAdminToken, isSendableToken } from "@/lib/admin-token";

// A made-up value with the shape of a real admin password; never use a real one here.
const TOKEN = "Ab3d-xY7Qw2ERTy_UiopASdfg4HJKlZxCvBnMqWeRtY";
// Built from code points so nothing invisible hides in this file.
const ch = (codePoint: number) => String.fromCodePoint(codePoint);
const ZERO_WIDTH_SPACE = ch(0x200b);
const SOFT_HYPHEN = ch(0x00ad);
const BYTE_ORDER_MARK = ch(0xfeff);
const NO_BREAK_SPACE = ch(0x00a0);
const WORD_JOINER = ch(0x2060);
const EN_DASH = ch(0x2013);
const EM_DASH = ch(0x2014);
const NON_BREAKING_HYPHEN = ch(0x2011);
const MINUS_SIGN = ch(0x2212);
const LEFT_CURLY = ch(0x201c);
const RIGHT_CURLY = ch(0x201d);

describe("cleanAdminToken", () => {
  it("leaves a correct password untouched", () => {
    expect(cleanAdminToken(TOKEN)).toBe(TOKEN);
    expect(cleanAdminToken("k7m2p9x4w3e8r5t6y1u2a4s6d8f3g5h7")).toBe(
      "k7m2p9x4w3e8r5t6y1u2a4s6d8f3g5h7",
    );
  });

  it.each([
    ["spaces and a line break around it", `  ${TOKEN} \n`],
    ["a line break in the middle (wrapped in a chat)", `${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)}`],
    ["a tab in the middle", `${TOKEN.slice(0, 5)}\t${TOKEN.slice(5)}`],
    ["an invisible zero-width space", TOKEN.slice(0, 10) + ZERO_WIDTH_SPACE + TOKEN.slice(10)],
    ["an invisible soft hyphen", TOKEN.slice(0, 10) + SOFT_HYPHEN + TOKEN.slice(10)],
    ["a byte-order mark at the start", BYTE_ORDER_MARK + TOKEN],
    ["a no-break space at the end", TOKEN + NO_BREAK_SPACE],
    ["a word joiner", TOKEN.slice(0, 3) + WORD_JOINER + TOKEN.slice(3)],
    ["an en dash instead of the hyphen", TOKEN.replace("-", EN_DASH)],
    ["an em dash instead of the hyphen", TOKEN.replace("-", EM_DASH)],
    ["a non-breaking hyphen", TOKEN.replace("-", NON_BREAKING_HYPHEN)],
    ["a minus sign", TOKEN.replace("-", MINUS_SIGN)],
    ["curly quotes around it", LEFT_CURLY + TOKEN + RIGHT_CURLY],
    ["straight quotes around it", `"${TOKEN}"`],
    ["backticks around it", `\`${TOKEN}\``],
  ])("recovers the password from %s", (_label, pasted) => {
    const cleaned = cleanAdminToken(pasted);
    expect(cleaned).toBe(TOKEN);
    expect(isSendableToken(cleaned)).toBe(true);
  });

  it("returns an empty string for only spaces or invisible characters", () => {
    expect(cleanAdminToken(`  ${ZERO_WIDTH_SPACE}\n`)).toBe("");
  });

  it("does not invent characters: a missing underscore stays missing", () => {
    expect(cleanAdminToken(TOKEN.replace("_", ""))).toBe(TOKEN.replace("_", ""));
  });
});

describe("isSendableToken", () => {
  it("accepts printable ASCII", () => {
    expect(isSendableToken(TOKEN)).toBe(true);
    expect(isSendableToken("definitely-wrong")).toBe(true);
  });

  it.each([
    ["a Cyrillic letter", `abc${ch(0x0430)}def`],
    ["an emoji", `abc${ch(0x1f600)}def`],
    ["an accented letter", `caf${ch(0x00e9)}`],
    ["a zero-width space that was not cleaned", `abc${ZERO_WIDTH_SPACE}def`],
    ["a space", "abc def"],
    ["nothing", ""],
  ])("rejects %s", (_label, value) => {
    expect(isSendableToken(value)).toBe(false);
  });
});
