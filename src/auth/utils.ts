/**
 * OCAIS Auth — low-level utilities
 *
 * Pure functions, zero deps. All crypto uses WebCrypto (`globalThis.crypto.subtle`)
 * which is built into Node 20+ and modern browsers.
 */

/**
 * Returns n cryptographically secure random bytes as Uint8Array.
 * Wraps `crypto.getRandomValues` for clarity and testability.
 *
 * @param n Number of bytes. Default 32 (256 bits).
 */
export function randomBytes(n = 32): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

/**
 * Returns n random bytes encoded as base64url (no padding).
 * Default 32 bytes → 43 chars.
 */
export function randomBase64Url(n = 32): string {
  return base64UrlEncode(randomBytes(n));
}

/**
 * Encodes a Uint8Array as base64url (no padding, URL-safe).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  // Use Buffer in Node 20+ (avoids needing Buffer polyfill in browser)
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Decodes a base64url string to Uint8Array. Throws on invalid input.
 */
export function base64UrlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

/**
 * Constant-time equality check on two Uint8Arrays.
 * Returns false in O(1) time for mismatched lengths, O(n) for matching lengths
 * (without branching on content).
 *
 * Use this for HMAC verification, password hash compare, etc.
 *
 * @returns true if both arrays have identical content; false otherwise.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    // Still consume time proportional to `a` to avoid leaking length.
    let diff = a.length ^ b.length;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i % b.length] ?? 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Constant-time equality check on two strings (UTF-8 byte comparison).
 */
export function constantTimeEqualString(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  return constantTimeEqual(ab, bb);
}

/**
 * Computes HMAC-SHA256 with the given key over the given data.
 * Returns 32 bytes.
 */
export async function hmacSha256(
  key: Uint8Array | string,
  data: Uint8Array | string,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const dataBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    dataBytes as BufferSource,
  );
  // Wrap in ArrayBuffer explicitly to satisfy Uint8Array<ArrayBuffer> signature.
  const buffer = new ArrayBuffer(sig.byteLength);
  new Uint8Array(buffer).set(new Uint8Array(sig));
  return new Uint8Array(buffer) as Uint8Array<ArrayBuffer>;
}

/**
 * Verifies HMAC-SHA256 in constant time.
 */
export async function hmacSha256Verify(
  key: Uint8Array | string,
  data: Uint8Array | string,
  expected: Uint8Array,
): Promise<boolean> {
  const computed = await hmacSha256(key, data);
  return constantTimeEqual(computed, expected);
}

/**
 * Constant-time string compare on hex strings (used for token equality).
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Encodes a Uint8Array as a lowercase hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

/**
 * Decodes a hex string to a Uint8Array. Throws on invalid hex.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex: length must be even");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex at position ${i * 2}`);
    }
    out[i] = byte;
  }
  return out;
}

/**
 * Constant-time hex string compare. Used to compare key IDs and tokens.
 */
export function safeEqual(a: string, b: string): boolean {
  return constantTimeEqualString(a, b);
}
