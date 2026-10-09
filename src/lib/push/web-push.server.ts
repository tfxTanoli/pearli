/**
 * Minimal Web Push sender built on Web Crypto only, so it runs on both Node and
 * Cloudflare Workers (the default nitro target) without the Node-only
 * `web-push` package.
 *
 * - Payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188)
 * - Server identification: RFC 8292 (VAPID, ES256 JWT)
 */

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const RECORD_SIZE = 4096;
// 86-byte header + 16-byte AES-GCM tag + 1-byte padding delimiter.
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - 86 - 16 - 1;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Bytes {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Builds a P-256 private JWK from raw base64url keys (65-byte public, 32-byte private). */
function p256PrivateJwk(publicKey: Bytes, privateKey: string): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("Expected an uncompressed 65-byte P-256 public key");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    d: privateKey,
    ext: true,
  };
}

export interface EncryptOptions {
  /** Test hook: fixed 16-byte salt instead of a random one. */
  salt?: Bytes;
  /** Test hook: fixed application-server ECDH key pair (raw base64url). */
  serverKeys?: { publicKey: string; privateKey: string };
}

/** Encrypts a push message body for one subscription (RFC 8291, single record). */
export async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicKey: string,
  authSecret: string,
  options: EncryptOptions = {},
): Promise<Bytes> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Push payload too large (${plaintext.length} > ${MAX_PAYLOAD_BYTES} bytes)`);
  }

  const uaPublic = base64UrlDecode(uaPublicKey);
  const auth = base64UrlDecode(authSecret);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));

  let asPrivate: CryptoKey;
  let asPublic: Bytes;
  if (options.serverKeys) {
    asPublic = base64UrlDecode(options.serverKeys.publicKey);
    asPrivate = await crypto.subtle.importKey(
      "jwk",
      p256PrivateJwk(asPublic, options.serverKeys.privateKey),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256),
  );

  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      concat(plaintext, new Uint8Array([0x02])),
    ),
  );

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

export interface VapidConfig {
  /** Uncompressed P-256 public key, base64url (shared with browsers). */
  publicKey: string;
  /** P-256 private scalar, base64url. Server-side only. */
  privateKey: string;
  /** Contact URI, e.g. "mailto:hello@example.com". */
  subject: string;
}

/** Signs a VAPID JWT for one push-service origin (RFC 8292). */
export async function createVapidJwt(
  audience: string,
  vapid: VapidConfig,
  expiresInSeconds = 12 * 60 * 60,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk",
    p256PrivateJwk(base64UrlDecode(vapid.publicKey), vapid.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // Web Crypto emits the raw r||s signature that JWS ES256 expects.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SendResult {
  status: number;
  /** The push service says this subscription no longer exists; delete it. */
  gone: boolean;
}

export async function sendWebPush(
  target: PushTarget,
  payload: string,
  vapid: VapidConfig,
  options: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" } = {},
): Promise<SendResult> {
  const body = await encryptPayload(encoder.encode(payload), target.keys.p256dh, target.keys.auth);
  const jwt = await createVapidJwt(new URL(target.endpoint).origin, vapid);

  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      TTL: String(options.ttlSeconds ?? 24 * 60 * 60),
      Urgency: options.urgency ?? "normal",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });
  // Drain the body so the connection can be reused.
  await response.arrayBuffer().catch(() => undefined);

  return { status: response.status, gone: response.status === 404 || response.status === 410 };
}
