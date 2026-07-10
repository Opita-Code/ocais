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
import type { CookieOptions, CookieAttributes } from './types.js';
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
export declare function cookieSign<T = unknown>(value: T, options: CookieOptions): Promise<string>;
/**
 * Verifies a sealed cookie and returns the original payload.
 *
 * @param cookieValue The cookie value (or raw value from Cookie header).
 * @param options.secret 32+ bytes. Must match the secret used in `cookieSign`.
 * @returns The original payload, or `null` if the cookie is invalid,
 *   tampered, or expired.
 */
export declare function cookieVerify<T = unknown>(cookieValue: string, options: {
    secret: Uint8Array | string;
}): Promise<T | null>;
/**
 * Builds a Set-Cookie header that DELETES the cookie. Useful for logout flows.
 */
export declare function buildDeleteCookieHeader(name: string, attrs?: Omit<CookieAttributes, "maxAge">): string;
/**
 * Inspects a sealed cookie's structure without verifying it. Useful for
 * debugging. NEVER use this in security-sensitive code paths.
 */
export declare function inspectCookie(cookieValue: string): {
    format: "ocais-sealed-v1";
    ivBytes: number;
    ciphertextBytes: number;
    macBytes: number;
    encrypted: true;
};
//# sourceMappingURL=cookie.d.ts.map