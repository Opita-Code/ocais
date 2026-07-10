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
export function randomBytes(n = 32) {
    const buf = new Uint8Array(n);
    globalThis.crypto.getRandomValues(buf);
    return buf;
}
/**
 * Returns n random bytes encoded as base64url (no padding).
 * Default 32 bytes → 43 chars.
 */
export function randomBase64Url(n = 32) {
    return base64UrlEncode(randomBytes(n));
}
/**
 * Encodes a Uint8Array as base64url (no padding, URL-safe).
 */
export function base64UrlEncode(bytes) {
    // Use Buffer in Node 20+ (avoids needing Buffer polyfill in browser)
    return Buffer.from(bytes).toString("base64url");
}
/**
 * Decodes a base64url string to Uint8Array. Throws on invalid input.
 */
export function base64UrlDecode(s) {
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
export function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        // Still consume time proportional to `a` to avoid leaking length.
        let diff = a.length ^ b.length;
        for (let i = 0; i < a.length; i++)
            diff |= a[i] ^ (b[i % b.length] ?? 0);
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
export function constantTimeEqualString(a, b) {
    const ab = new TextEncoder().encode(a);
    const bb = new TextEncoder().encode(b);
    return constantTimeEqual(ab, bb);
}
/**
 * Computes HMAC-SHA256 with the given key over the given data.
 * Returns 32 bytes.
 */
export async function hmacSha256(key, data) {
    const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
    const dataBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const cryptoKey = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const sig = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, dataBytes);
    // Wrap in ArrayBuffer explicitly to satisfy Uint8Array<ArrayBuffer> signature.
    const buffer = new ArrayBuffer(sig.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(sig));
    return new Uint8Array(buffer);
}
/**
 * Verifies HMAC-SHA256 in constant time.
 */
export async function hmacSha256Verify(key, data, expected) {
    const computed = await hmacSha256(key, data);
    return constantTimeEqual(computed, expected);
}
/**
 * Constant-time string compare on hex strings (used for token equality).
 */
export function constantTimeEqualHex(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
/**
 * Encodes a Uint8Array as a lowercase hex string.
 */
export function bytesToHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, "0");
    }
    return s;
}
/**
 * Decodes a hex string to a Uint8Array. Throws on invalid hex.
 */
export function hexToBytes(hex) {
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
export function safeEqual(a, b) {
    return constantTimeEqualString(a, b);
}
//# sourceMappingURL=utils.js.map