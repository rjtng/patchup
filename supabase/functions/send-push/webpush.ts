// Web Push with nothing but WebCrypto, so it runs the same in Supabase Edge
// Functions (Deno) and in Node: message encryption per RFC 8291 (aes128gcm)
// and sender identification per RFC 8292 (VAPID).

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { public_key: string; private_jwk: JsonWebKey };

const text = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** A new signing key pair: the public key as browsers want it, the private one as a JWK. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { public_key: toBase64Url(publicKey), private_jwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

/** The body of a push message: `payload` encrypted for one browser (a single aes128gcm record). */
export async function encrypt(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const browserKey = fromBase64Url(p256dh);
  const auth = fromBase64Url(authSecret);

  const ours = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ourPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ours.publicKey));
  const theirs = await crypto.subtle.importKey("raw", browserKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, ours.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(text.encode("WebPush: info\0"), browserKey, ourPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, text.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, text.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const record = concat(text.encode(payload), new Uint8Array([2])); // 2: the last (only) record
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record));

  // Header: salt, record size, then our public key (which the browser needs to decrypt).
  const header = new Uint8Array(16 + 4 + 1 + ourPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = ourPublic.length;
  header.set(ourPublic, 21);
  return concat(header, ciphertext);
}

/** The Authorization header identifying PatchUp to the push service (valid 12 hours). */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, subject: string, now = Date.now()) {
  const encode = (value: object) => toBase64Url(text.encode(JSON.stringify(value)));
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  })}`;
  const key = await crypto.subtle.importKey("jwk", vapid.private_jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, text.encode(unsigned)));
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${vapid.public_key}`;
}

/** Sends one push message; returns the push service's HTTP status. */
export async function sendPush(
  subscription: Subscription,
  payload: string,
  vapid: VapidKeys,
  subject: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const response = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 60 * 60), // keep trying for a day if the phone is off
      Urgency: "high",
      Authorization: await vapidAuthorization(subscription.endpoint, vapid, subject),
    },
    body: await encrypt(payload, subscription.p256dh, subscription.auth),
  });
  await response.body?.cancel();
  return response.status;
}
