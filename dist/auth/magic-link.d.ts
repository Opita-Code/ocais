/**
 * OCAIS Auth — magic-link primitive
 *
 * Two functions:
 * - `magicLinkRequest`: generates a single-use token, stores payload, returns
 *   token + expiry. Consumer sends the token via email.
 * - `magicLinkVerify`: validates the token, atomically deletes it, returns
 *   the original payload. Single-use: a successful verify invalidates the
 *   token for future calls.
 *
 * Security properties:
 * - Token: 32 bytes (256 bits) of crypto-random data, base64url-encoded.
 *   4x over OWASP minimum (64 bits).
 * - Storage: opaque token (never email). Email stored as HMAC for
 *   verification (prevents enumeration if storage leaks).
 * - Atomic delete: `deleteMagicLink` is called inside `magicLinkVerify` after
 *   successful retrieval. Consumers should use DDB `ConditionExpression:
 *   attribute_exists` to prevent TOCTOU races.
 * - Rate limit: per-email, default 1 per 60s. Implemented via
 *   `rateLimit` primitive.
 *
 * OWASP ASVS coverage:
 * - V2.5.1: Define password recovery paths
 * - V2.5.5: Use secure channels (consumer's responsibility for email transport)
 * - V2.7.1: Verify out-of-band auth codes
 */
import type { MagicLinkPayload, MagicLinkRequestOptions, MagicLinkVerifyOptions } from './types.js';
/**
 * Generates a magic-link token, stores the payload, and returns the token
 * to embed in the email link.
 *
 * @param payload User-defined data (typically email + redirect).
 * @param options Storage, secret, TTL, rate limit.
 * @returns `{ token, expiresAt }` where `token` is base64url-encoded.
 * @throws AuthRateLimitError if the per-email rate limit is exceeded.
 * @throws AuthStorageError if storage fails.
 */
export declare function magicLinkRequest(payload: MagicLinkPayload, options: MagicLinkRequestOptions): Promise<{
    token: string;
    expiresAt: number;
}>;
/**
 * Validates a magic-link token, atomically deletes it, and returns the
 * original payload. Single-use: a successful call invalidates the token
 * for future calls.
 *
 * Atomic-delete pattern: the storage adapter's `deleteMagicLink` is called
 * after `getMagicLink` returns a hit. For DDB, use `ConditionExpression:
 * attribute_exists` in `DeleteItem` to prevent TOCTOU races where two
 * parallel verify calls both succeed.
 *
 * @param args.token The token from the URL query (base64url).
 * @param options Storage, secret.
 * @returns The original payload, or `null` if the token is invalid, expired,
 *   or already used.
 * @throws AuthMagicLinkInvalidError if the token format is malformed.
 */
export declare function magicLinkVerify(args: {
    token: string;
}, options: MagicLinkVerifyOptions): Promise<MagicLinkPayload | null>;
//# sourceMappingURL=magic-link.d.ts.map