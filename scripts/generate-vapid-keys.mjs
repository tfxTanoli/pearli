// Generates a VAPID key pair for Web Push. Run: node scripts/generate-vapid-keys.mjs
// Use a separate pair for development and production. Never commit the private key.
import { webcrypto as crypto } from "node:crypto";

const toBase64Url = (bytes) => Buffer.from(bytes).toString("base64url");

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
const { d } = await crypto.subtle.exportKey("jwk", privateKey);
const adminToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

console.log(`VAPID_PUBLIC_KEY=${toBase64Url(rawPublic)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
console.log(`PUSH_ADMIN_TOKEN=${adminToken}`);
