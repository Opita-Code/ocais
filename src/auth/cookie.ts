/**
 * OCAIS Auth — sealed cookie primitive
 *
 * HMAC-SHA256 + AES-256-GCM sealed cookies. Tamper-evident and (optionally)
 * encrypted. The cookie payload is JSON-encoded.
 *
 * Security properties:
 * - Authentication: HMAC-SHA256 over the encrypted payload. Wrong key →
 *   reject (constant-time).
 * - Encryption: AES-256-GCM (authenticated encryption with associated data).
 *   Even if the cookie leaks, contents are confidential.
 * - Expiry: embedded `exp` claim (Unix seconds). Verified on every read.
 * - Key derivation: HKDF-Expand from the user-supplied secret to derive
 *   separate HMAC and AES keys from a single secret.
 * - Tampering: any modification breaks HMAC (and AES-GCM auth tag, if
 *   the cipher is used).
 *
 * Format (compact, URL-safe):
 *   <base64url(IV || AES-GCM(ciphertext) || authTag) || "." || base64url(HMAC)>
 *
 * The HMAC is computed over the entire IV||ciphertext||authTag blob, providing
 * defense-in-depth (AES-GCM already has its own auth tag).
 *
 * OWASP ASVS coverage:
 * - V3.2.3: Bind session to client (cookie attributes)
 * - V3.4.1: Set Secure on cookies
 * - V3.4.2: Set HttpOnly on session cookies
 * - V3.4.3: Set SameSite on session cookies
 * - V6.2.1: Use authenticated encryption for sensitive data
 */

import {
  base64UrlEncode,
  base64UrlDecode,
  constantTimeEqual,
  hmacSha256,
} from './utils.js';
import {
  AuthCookieInvalidError,
  AuthError,
} from './errors.js';
import type { CookieOptions, CookieAttributes } from './types.js';

// ─── HKDF for key derivation ───────────────────────────────────────────

/**
 * HKDF-Extract + HKDF-Expand per RFC 5869, using HMAC-SHA256.
 * Returns 64 bytes (32 for HMAC, 32 for AES).
 */
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  // Extract
  const prk = await hmacSha256(salt, ikm);

  // Expand
  const n = Math.ceil(length / 32);
  const okm = new Uint8Array(n * 32);
  let previous: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
  for (let i = 1; i <= n; i++) {
    const input = new Uint8Array(new ArrayBuffer(previous.length + info.length + 1));
    input.set(previous, 0);
    input.set(info, previous.length);
    input[input.length - 1] = i;
    previous = await hmacSha256(prk, input as unknown as Uint8Array);
    // Copy bytes manually because okm.set expects Uint8Array<ArrayBuffer>
    for (let j = 0; j < 32; j++) {
      okm[(i - 1) * 32 + j] = previous[j]!;
    }
  }
  return okm.slice(0, length);
}

async function deriveKeys(secret: Uint8Array): Promise<{ hmacKey: Uint8Array; aesKey: Uint8Array }> {
  const salt = new TextEncoder().encode("ocais-cookie-v1");
  const info = new TextEncoder().encode("ocais-cookie");
  const okm = await hkdf(secret, salt, info, 64);
  return {
    hmacKey: okm.slice(0, 32),
    aesKey: okm.slice(32, 64),
  };
}

// ─── AES-256-GCM helpers ────────────────────────────────────────────────

async function aesGcmEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
    cryptoKey,
    plaintext as BufferSource,
  );
  return new Uint8Array(ct);
}

async function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
    cryptoKey,
    ciphertext as BufferSource,
  );
  return new Uint8Array(pt);
}

// ─── cookieSign ──────────────────────────────────────────────────────────

/**
 * Signs (and optionally encrypts) a value as a sealed cookie.
 *
 * @param value The cookie payload (must be JSON-serializable).
 * @param options.secret 32+ bytes. HMAC + AES keys derived via HKDF.
 * @param options.expiresInSec Default: 604_800 (7 days). 0 = session cookie.
 * @param options.attributes If provided, returns a `Set-Cookie` header value
 *   (e.g. `ocais=<value>; Domain=.example.com; ...`). If omitted, returns
 *   just the cookie value (consumer must build the header).
 * @returns The cookie value (or full Set-Cookie header if attributes given).
 */
export async function cookieSign<T = unknown>(
  value: T,
  options: CookieOptions,
): Promise<string> {
  const { secret, expiresInSec = 604_800 } = options;
  const secretBytes = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;

  if (secretBytes.length < 32) {
    throw new AuthError("AUTH_CONFIG", "Secret must be at least 32 bytes");
  }
  if (expiresInSec < 0) {
    throw new AuthError("AUTH_CONFIG", "expiresInSec must be >= 0");
  }

  const { hmacKey, aesKey } = await deriveKeys(secretBytes);

  // Build payload with expiry (using ms timestamps internally for precision)
  const nowMs = Date.now();
  const payload = {
    v: value,
    iat: nowMs,
    exp: nowMs + expiresInSec * 1000,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  // Encrypt with AES-256-GCM
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const aad = new TextEncoder().encode("ocais-cookie-v1");
  const ct = await aesGcmEncrypt(aesKey, iv, plaintext, aad);

  // Blob: IV || ciphertext (with embedded auth tag)
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);

  // HMAC over the blob (defense-in-depth)
  const mac = await hmacSha256(hmacKey, blob);

  // Encode: base64url(blob) || "." || base64url(mac)
  const cookieValue = `${base64UrlEncode(blob)}.${base64UrlEncode(mac)}`;

  if (options.attributes) {
    return formatSetCookieHeader(cookieValue, options.attributes, expiresInSec);
  }
  return cookieValue;
}

// ─── cookieVerify ────────────────────────────────────────────────────────

/**
 * Verifies a sealed cookie and returns the original payload.
 *
 * @param cookieValue The cookie value (or raw value from Cookie header).
 * @param options.secret 32+ bytes. Must match the secret used in `cookieSign`.
 * @returns The original payload, or `null` if the cookie is invalid,
 *   tampered, or expired.
 */
export async function cookieVerify<T = unknown>(
  cookieValue: string,
  options: { secret: Uint8Array | string },
): Promise<T | null> {
  const secretBytes =
    typeof options.secret === "string"
      ? new TextEncoder().encode(options.secret)
      : options.secret;

  if (secretBytes.length < 32) {
    throw new AuthError("AUTH_CONFIG", "Secret must be at least 32 bytes");
  }

  // Strip the value from the cookie if a full Set-Cookie header was passed
  let raw = cookieValue;
  if (raw.includes("=")) {
    const eq = raw.indexOf("=");
    raw = raw.substring(eq + 1).split(";")[0];
  }

  const parts = raw.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [blobB64, macB64] = parts;

  let blob: Uint8Array;
  let mac: Uint8Array;
  try {
    blob = base64UrlDecode(blobB64);
    mac = base64UrlDecode(macB64);
  } catch {
    return null;
  }

  // Verify HMAC (constant-time)
  const { hmacKey, aesKey } = await deriveKeys(secretBytes);
  const expectedMac = await hmacSha256(hmacKey, blob);
  if (!constantTimeEqual(expectedMac, mac)) {
    return null;
  }

  // Decrypt
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const aad = new TextEncoder().encode("ocais-cookie-v1");
  let plaintext: Uint8Array;
  try {
    plaintext = await aesGcmDecrypt(aesKey, iv, ct, aad);
  } catch {
    // AES-GCM auth tag mismatch → reject
    return null;
  }

  // Parse and check expiry
  let payload: { v: T; iat: number; exp: number };
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
  const now = Date.now();
  // Allow 2 second clock skew to avoid false rejections at the boundary.
  if (typeof payload.exp !== "number" || payload.exp + 2000 < now) {
    return null;
  }

  return payload.v;
}

// ─── Set-Cookie header formatting ───────────────────────────────────────

function formatSetCookieHeader(
  value: string,
  attrs: CookieAttributes,
  maxAge: number,
): string {
  const parts: string[] = [`ocais=${value}`];
  if (attrs.path) parts.push(`Path=${attrs.path}`);
  else parts.push("Path=/");
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  if (attrs.secure ?? true) parts.push("Secure");
  if (attrs.httpOnly ?? true) parts.push("HttpOnly");
  if (attrs.sameSite) {
    parts.push(`SameSite=${attrs.sameSite}`);
  } else {
    parts.push("SameSite=Lax");
  }
  if (maxAge > 0) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

/**
 * Builds a Set-Cookie header that DELETES the cookie. Useful for logout flows.
 */
export function buildDeleteCookieHeader(
  name: string,
  attrs: Omit<CookieAttributes, "maxAge"> = {},
): string {
  const parts: string[] = [`${name}=`];
  if (attrs.path) parts.push(`Path=${attrs.path}`);
  else parts.push("Path=/");
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  if (attrs.secure ?? true) parts.push("Secure");
  if (attrs.httpOnly ?? true) parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  parts.push("Max-Age=0");
  parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return parts.join("; ");
}

// ─── Debug helpers ──────────────────────────────────────────────────────

/**
 * Inspects a sealed cookie's structure without verifying it. Useful for
 * debugging. NEVER use this in security-sensitive code paths.
 */
export function inspectCookie(cookieValue: string): {
  format: "ocais-sealed-v1";
  ivBytes: number;
  ciphertextBytes: number;
  macBytes: number;
  // Encrypted payload — cannot be read without the secret
  encrypted: true;
} {
  let raw = cookieValue;
  if (raw.includes("=")) {
    const eq = raw.indexOf("=");
    raw = raw.substring(eq + 1).split(";")[0];
  }
  const parts = raw.split(".");
  if (parts.length !== 2) {
    throw new AuthCookieInvalidError("Cookie is malformed (expected 2 parts)");
  }
  const blob = base64UrlDecode(parts[0]);
  const mac = base64UrlDecode(parts[1]);
  if (blob.length < 12 + 16) {
    throw new AuthCookieInvalidError("Cookie blob is too short (expected at least 28 bytes)");
  }
  return {
    format: "ocais-sealed-v1",
    ivBytes: 12,
    ciphertextBytes: blob.length - 12 - 16, // 16 bytes = GCM tag
    macBytes: mac.length,
    encrypted: true,
  };
}
