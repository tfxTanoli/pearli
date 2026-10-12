// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanAdminToken, unusualCharacters } from "@/lib/admin-token";

// A made-up value with the shape of a real admin password; never use a real one here.
const TOKEN = "Ab3d-xY7Qw2ERTy_UiopASdfg4HJKlZxCvBnMqWeRtY";
// Built from code points so nothing invisible hides in this file.
const ch = (codePoint: number) => String.fromCodePoint(codePoint);
const insert = (codePoint: number, at = 10) => TOKEN.slice(0, at) + ch(codePoint) + TOKEN.slice(at);

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
    ["a zero-width space", insert(0x200b)],
    ["a zero-width joiner", insert(0x200d)],
    ["a soft hyphen", insert(0x00ad)],
    ["a byte-order mark at the start", ch(0xfeff) + TOKEN],
    ["a no-break space at the end", TOKEN + ch(0x00a0)],
    ["a word joiner", insert(0x2060, 3)],
    ["direction isolates around it", ch(0x2068) + TOKEN + ch(0x2069)],
    ["direction embedding marks around it", ch(0x202a) + TOKEN + ch(0x202c)],
    ["a left-to-right mark", insert(0x200e)],
    ["an object-replacement character", insert(0xfffc)],
    ["a variation selector", insert(0xfe0f)],
    ["a combining grapheme joiner", insert(0x034f)],
    ["an Arabic letter mark", insert(0x061c)],
    ["a line separator", insert(0x2028)],
    ["an en dash instead of the hyphen", TOKEN.replace("-", ch(0x2013))],
    ["an em dash instead of the hyphen", TOKEN.replace("-", ch(0x2014))],
    ["a non-breaking hyphen", TOKEN.replace("-", ch(0x2011))],
    ["a minus sign", TOKEN.replace("-", ch(0x2212))],
    ["a full-width hyphen", TOKEN.replace("-", ch(0xff0d))],
    ["a full-width underscore", TOKEN.replace("_", ch(0xff3f))],
    ["a full-width first letter", ch(0xff21) + TOKEN.slice(1)],
    ["curly quotes around it", ch(0x201c) + TOKEN + ch(0x201d)],
    ["straight quotes around it", `"${TOKEN}"`],
    ["backticks around it", `\`${TOKEN}\``],
    ["an emoji after it", TOKEN + ch(0x1f600)],
  ])("recovers the password from %s", (_label, pasted) => {
    expect(cleanAdminToken(pasted)).toBe(TOKEN);
  });

  it("only ever returns characters a browser will send in a request header", () => {
    const everything = Array.from({ length: 0x3000 }, (_, i) => ch(i)).join("") + ch(0x1f600);
    expect(cleanAdminToken(everything)).toMatch(/^[\x21-\x7E]*$/);
  });

  it("returns an empty string for only spaces or invisible characters", () => {
    expect(cleanAdminToken(`  ${ch(0x200b)}${ch(0x2068)}\n`)).toBe("");
  });

  it("does not invent characters: a missing underscore stays missing", () => {
    expect(cleanAdminToken(TOKEN.replace("_", ""))).toBe(TOKEN.replace("_", ""));
  });

  it("drops letters from other alphabets rather than sending them", () => {
    expect(cleanAdminToken(`abc${ch(0x0430)}def`)).toBe("abcdef");
  });
});

describe("unusualCharacters", () => {
  it("reports nothing for a normal password, even with spaces and line breaks", () => {
    expect(unusualCharacters(TOKEN)).toEqual([]);
    expect(unusualCharacters(`  ${TOKEN}\t\r\n`)).toEqual([]);
  });

  it("names each unusual character once, as a code point", () => {
    const pasted = ch(0x2068) + insert(0x200b) + ch(0x200b) + ch(0x2069) + ch(0x1f600);
    expect(unusualCharacters(pasted)).toEqual(["U+2068", "U+200B", "U+2069", "U+1F600"]);
  });

  it("reports a typographic dash and curly quotes", () => {
    expect(unusualCharacters(ch(0x201c) + TOKEN.replace("-", ch(0x2013)) + ch(0x201d))).toEqual([
      "U+201C",
      "U+2013",
      "U+201D",
    ]);
  });

  it("pads short code points to four digits", () => {
    expect(unusualCharacters(ch(0x00ad))).toEqual(["U+00AD"]);
  });
});
