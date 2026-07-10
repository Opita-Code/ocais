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
export declare function randomBytes(n?: number): Uint8Array;
/**
 * Returns n random bytes encoded as base64url (no padding).
 * Default 32 bytes → 43 chars.
 */
export declare function randomBase64Url(n?: number): string;
/**
 * Encodes a Uint8Array as base64url (no padding, URL-safe).
 */
export declare function base64UrlEncode(bytes: Uint8Array): string;
/**
 * Decodes a base64url string to Uint8Array. Throws on invalid input.
 */
export declare function base64UrlDecode(s: string): Uint8Array;
/**
 * Constant-time equality check on two Uint8Arrays.
 * Returns false in O(1) time for mismatched lengths, O(n) for matching lengths
 * (without branching on content).
 *
 * Use this for HMAC verification, password hash compare, etc.
 *
 * @returns true if both arrays have identical content; false otherwise.
 */
export declare function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean;
/**
 * Constant-time equality check on two strings (UTF-8 byte comparison).
 */
export declare function constantTimeEqualString(a: string, b: string): boolean;
/**
 * Computes HMAC-SHA256 with the given key over the given data.
 * Returns 32 bytes.
 */
export declare function hmacSha256(key: Uint8Array | string, data: Uint8Array | string): Promise<Uint8Array<ArrayBuffer>>;
/**
 * Verifies HMAC-SHA256 in constant time.
 */
export declare function hmacSha256Verify(key: Uint8Array | string, data: Uint8Array | string, expected: Uint8Array): Promise<boolean>;
/**
 * Constant-time string compare on hex strings (used for token equality).
 */
export declare function constantTimeEqualHex(a: string, b: string): boolean;
/**
 * Encodes a Uint8Array as a lowercase hex string.
 */
export declare function bytesToHex(bytes: Uint8Array): string;
/**
 * Decodes a hex string to a Uint8Array. Throws on invalid hex.
 */
export declare function hexToBytes(hex: string): Uint8Array;
/**
 * Constant-time hex string compare. Used to compare key IDs and tokens.
 */
export declare function safeEqual(a: string, b: string): boolean;
//# sourceMappingURL=utils.d.ts.map