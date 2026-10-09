// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidJwt,
  encryptPayload,
  MAX_PAYLOAD_BYTES,
} from "@/lib/push/web-push.server";

// RFC 8291 §5 / Appendix A.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  // §5: the complete request body (header || ciphertext). §5 says Content-Length 145,
  // but the body is 144 bytes: 86 header + 41 plaintext + 1 delimiter + 16 tag.
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

const enc = new TextEncoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
      key,
      length * 8,
    ),
  );
}

/** What the browser does on receipt — decrypt with the user agent's private key. */
async function decryptAsUserAgent(
  body: Uint8Array,
  uaPrivate: CryptoKey,
  uaPublic: Uint8Array,
  auth: Uint8Array,
) {
  const salt = body.slice(0, 16);
  const idLen = body[20]!;
  const asPublic = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const asKey = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, uaPrivate, 256),
  );
  const keyInfo = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
  );
  expect(padded[padded.length - 1]).toBe(0x02);
  return new TextDecoder().decode(padded.slice(0, -1));
}

describe("Web Push encryption (RFC 8291)", () => {
  it("matches the RFC 8291 worked example byte for byte", async () => {
    const body = await encryptPayload(enc.encode(RFC.plaintext), RFC.uaPublic, RFC.authSecret, {
      salt: base64UrlDecode(RFC.salt),
      serverKeys: { publicKey: RFC.asPublic, privateKey: RFC.asPrivate },
    });
    expect(body.length).toBe(144);
    expect(base64UrlEncode(body)).toBe(RFC.message);
  });

  it("decrypts the RFC 8291 example with the receiver's key (validates the test helper)", async () => {
    const uaPublic = base64UrlDecode(RFC.uaPublic);
    const uaPrivate = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: base64UrlEncode(uaPublic.slice(1, 33)),
        y: base64UrlEncode(uaPublic.slice(33, 65)),
        d: RFC.uaPrivate,
      },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const plaintext = await decryptAsUserAgent(
      base64UrlDecode(RFC.message),
      uaPrivate,
      uaPublic,
      base64UrlDecode(RFC.authSecret),
    );
    expect(plaintext).toBe(RFC.plaintext);
  });

  it("produces messages a browser can decrypt (random keys and salt)", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const message = JSON.stringify({ title: "Pearli", body: "Hello £ ✨", url: "/offers" });

    const body = await encryptPayload(
      enc.encode(message),
      base64UrlEncode(uaPublic),
      base64UrlEncode(auth),
    );

    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(await decryptAsUserAgent(body, ua.privateKey, uaPublic, auth)).toBe(message);
  });

  it("rejects payloads that do not fit in one record", async () => {
    await expect(
      encryptPayload(new Uint8Array(MAX_PAYLOAD_BYTES + 1), RFC.uaPublic, RFC.authSecret),
    ).rejects.toThrow(/too large/);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs an ES256 JWT that verifies against the public key", async () => {
    const vapid = {
      publicKey: RFC.asPublic,
      privateKey: RFC.asPrivate,
      subject: "mailto:test@example.com",
    };
    const jwt = await createVapidJwt("https://fcm.googleapis.com", vapid);
    const [header = "", claims = "", signature = ""] = jwt.split(".");

    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(header)))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(claims)));
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:test@example.com");
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    expect(payload.exp).toBeLessThanOrEqual(Date.now() / 1000 + 24 * 60 * 60);

    const verifyKey = await crypto.subtle.importKey(
      "raw",
      base64UrlDecode(vapid.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64UrlDecode(signature),
      enc.encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});
