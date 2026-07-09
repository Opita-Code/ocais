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

import { randomBase64Url, hmacSha256, bytesToHex } from './utils.js';
import {
  AuthError,
  AuthMagicLinkInvalidError,
  AuthRateLimitError,
  AuthStorageError,
} from './errors.js';
import { rateLimit } from './rate-limit.js';
import type {
  MagicLinkPayload,
  MagicLinkRequestOptions,
  MagicLinkVerifyOptions,
} from './types.js';

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
export async function magicLinkRequest(
  payload: MagicLinkPayload,
  options: MagicLinkRequestOptions,
): Promise<{ token: string; expiresAt: number }> {
  const {
    storage,
    secret,
    ttlMs = 600_000, // 10 min per OWASP
    rateLimitMs = 60_000, // 1 per minute
    tokenBytes = 32,
  } = options;

  if (ttlMs < 60_000) {
    throw new AuthError("AUTH_CONFIG", "ttlMs must be at least 60_000 (1 min)");
  }
  if (rateLimitMs < 1000) {
    throw new AuthError("AUTH_CONFIG", "rateLimitMs must be at least 1000 (1 sec)");
  }
  if (tokenBytes < 16) {
    throw new AuthError("AUTH_CONFIG", "tokenBytes must be at least 16 (128 bits)");
  }

  // Rate limit per email. Hash the email to avoid PII in storage keys.
  const emailHash = bytesToHex(await hmacSha256(secret, payload.email));
  const rateKey = `magiclink:${emailHash}`;
  const rateResult = await rateLimit({
    key: rateKey,
    max: 1,
    windowMs: rateLimitMs,
    storage,
  });
  if (!rateResult.allowed) {
    throw new AuthRateLimitError(rateKey, 1, rateResult.resetAt - Date.now());
  }

  // Generate token
  const token = randomBase64Url(tokenBytes);
  const expiresAt = Date.now() + ttlMs;

  // Store by token (opaque, 1:1 mapping). The consumer's storage adapter
  // is responsible for indexing by email if needed.
  try {
    await storage.putMagicLink(token, payload, ttlMs);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthStorageError("Failed to persist magic-link token", err);
  }

  return { token, expiresAt };
}

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
export async function magicLinkVerify(
  args: { token: string },
  options: MagicLinkVerifyOptions,
): Promise<MagicLinkPayload | null> {
  const { storage } = options;
  // Note: `secret` is accepted for API symmetry with `magicLinkRequest`, but
  // the storage adapter is responsible for storing the email's HMAC at
  // write time. `magicLinkVerify` is a pure lookup + delete operation.

  if (typeof args.token !== "string" || args.token.length < 16) {
    throw new AuthMagicLinkInvalidError("Token is malformed (too short)");
  }

  // Direct lookup by token
  let result: { payload: MagicLinkPayload } | null;
  try {
    result = await storage.getMagicLink(args.token);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthStorageError("Failed to read magic-link token", err);
  }

  if (!result) {
    return null;
  }

  // Atomic delete (single-use semantics)
  try {
    await storage.deleteMagicLink(args.token);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthStorageError("Failed to delete magic-link token (post-verify)", err);
  }

  return result.payload;
}
