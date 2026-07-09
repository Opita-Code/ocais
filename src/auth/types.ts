/**
 * OCAIS Auth — shared types
 *
 * All types are exported via `@opita/ocais/auth`. Consumers implement the
 * `AuthStorage` interface to plug in their backend (DDB, Redis, etc.).
 */

import type { AuthError } from './errors.js';

/**
 * Storage adapter that OCAIS uses to persist magic-link tokens, JWT keys,
 * and rate-limit counters. OCAIS does NOT ship a DDB adapter — consumers
 * implement this interface using their preferred backend.
 *
 * All methods are async. Implementations should be idempotent and
 * fail-fast on storage errors (throw `AuthStorageError`).
 */
export interface AuthStorage {
  // ─── Magic-link ─────────────────────────────────────────────────────────

  /**
   * Stores a magic-link payload keyed by an opaque token.
   * @param token 32+ byte random token (base64url).
   * @param payload User-defined data (typically email + redirect).
   * @param ttlMs Milliseconds until the token expires.
   * @throws AuthStorageError if storage fails.
   */
  putMagicLink(token: string, payload: MagicLinkPayload, ttlMs: number): Promise<void>;

  /**
   * Retrieves a magic-link payload. Returns null if not found or expired.
   * Does NOT delete the entry (call `deleteMagicLink` after verification).
   */
  getMagicLink(token: string): Promise<{ payload: MagicLinkPayload } | null>;

  /**
   * Atomically deletes a magic-link token. Use `ConditionExpression`
   * (DDB) or equivalent to ensure single-use semantics.
   * Idempotent: deleting a non-existent token is a no-op.
   */
  deleteMagicLink(token: string): Promise<void>;

  // ─── JWT keys ─────────────────────────────────────────────────────────────

  /**
   * Returns the currently active signing key ID (the one used to sign new JWTs).
   */
  getActiveKeyId(): Promise<string>;

  /**
   * Returns the key material for a given key ID. `secretOrPrivate` is the
   * raw secret (HS256) or private key (EdDSA) bytes. `publicKey` is only
   * present for EdDSA.
   * Returns null if the key ID is not found.
   */
  getKeyById(
    keyId: string,
  ): Promise<{ secretOrPrivate: Uint8Array; publicKey?: Uint8Array } | null>;

  /**
   * Marks a new key as active. Existing tokens signed with the previous key
   * remain valid (until they expire) — this is the 24h grace period.
   * Implementations should:
   * 1. Store the new key with status=active
   * 2. Mark the old key as deprecated
   * 3. Reject key IDs that are unknown
   */
  rotateKey(newKeyId: string, secretOrPrivate: Uint8Array, publicKey?: Uint8Array): Promise<void>;

  /**
   * Lists all valid key IDs (active + deprecated). Used by `jwksPublish` to
   * return a JWKS document.
   */
  listKeyIds(): Promise<string[]>;

  // ─── Rate limit ───────────────────────────────────────────────────────────

  /**
   * Increments a counter for the given key and returns the new count and the
   * timestamp (ms since epoch) when the counter resets.
   * Implementations should use a fixed-window or token-bucket algorithm.
   * For DDB: atomic counter with TTL = `windowMs`.
   * For in-memory: `Map<key, { count, resetAt }>`.
   */
  incrCounter(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }>;
}

// ─── Magic-link ───────────────────────────────────────────────────────────

/**
 * Data stored alongside a magic-link token. The consumer controls the
 * payload shape — typically the email and intended redirect target.
 */
export interface MagicLinkPayload {
  /** User's email address. Verified at verify time (consumer's responsibility). */
  email: string;

  /**
   * URL the user is redirected to after clicking the magic link.
   * HMAC-validated by consumer to prevent open-redirect attacks.
   */
  redirectTo: string;

  /**
   * Optional: request metadata for audit logs.
   */
  metadata?: {
    ip?: string;
    userAgent?: string;
    requestedAt?: number;
  };
}

/**
 * Options for `magicLinkRequest`.
 */
export interface MagicLinkRequestOptions {
  /** Storage adapter (DDB, Redis, in-memory). */
  storage: AuthStorage;

  /**
   * Secret used to HMAC the email before storing (prevents email enumeration
   * via storage access). 32+ bytes recommended.
   */
  secret: string | Uint8Array;

  /**
   * Token TTL in milliseconds. Default: 600_000 (10 min).
   * OWASP ASVS V2.5: short-lived auth codes, max 15 min recommended.
   */
  ttlMs?: number;

  /**
   * Rate limit window per email. Default: 60_000 (1 min).
   * The first request in a window is allowed; subsequent requests within the
   * window throw `AuthRateLimitError`.
   */
  rateLimitMs?: number;

  /**
   * Optional token size in bytes. Default: 32 (256 bits).
   * OWASP recommends ≥ 128 bits. 32 bytes is 4x over.
   */
  tokenBytes?: number;
}

/**
 * Options for `magicLinkVerify`.
 */
export interface MagicLinkVerifyOptions {
  /** Storage adapter. */
  storage: AuthStorage;

  /**
   * Secret used to HMAC the email before storing. MUST match the secret used
   * in `magicLinkRequest`.
   */
  secret: string | Uint8Array;
}

// ─── JWT ─────────────────────────────────────────────────────────────────

/**
 * Standard JWT claims per RFC 7519. Custom claims are allowed.
 */
export interface JWTClaims {
  /** Subject (user ID). Required. */
  sub: string;

  /** Issued at (Unix seconds). Set automatically. */
  iat?: number;

  /** Expiration (Unix seconds). Set automatically from `expiresInSec`. */
  exp?: number;

  /** Not before (Unix seconds). Optional. */
  nbf?: number;

  /** Issuer. Required for production. */
  iss?: string;

  /** Audience. Required for production. */
  aud?: string | string[];

  /** JWT ID. Auto-generated if not provided. */
  jti?: string;

  /** Custom claims. Consumer-defined. */
  [key: string]: unknown;
}

/**
 * Algorithm for signing/verifying JWTs. Default: HS256.
 *
 * - HS256: HMAC-SHA256, symmetric key. Simple, fast. Use when only one
 *   service signs and verifies.
 * - EdDSA: Ed25519, asymmetric. Use when multiple services need to verify
 *   without holding the signing key.
 */
export type JWTAlgorithm = "HS256" | "EdDSA";

/**
 * Options for `signJWT`.
 */
export interface SignJWTOptions {
  /** Storage adapter. */
  storage: AuthStorage;

  /**
   * Secret (HS256) or private key (EdDSA) bytes. 32+ bytes for HS256, 32+ bytes
   * for EdDSA private key. If omitted, the active key from storage is used.
   */
  secret?: Uint8Array;

  /** Algorithm. Default: HS256. */
  alg?: JWTAlgorithm;

  /**
   * Token expiry in seconds from now. Default: 900 (15 min).
   * OWASP ASVS V3.2.2: short-lived tokens, max 1 hour recommended for access tokens.
   */
  expiresInSec?: number;

  /**
   * Optional notBefore offset in seconds from now. Default: 0 (immediately valid).
   */
  notBeforeSec?: number;

  /**
   * Optional key ID. If provided, this key is used to sign. If omitted, the
   * active key from storage is used.
   */
  keyId?: string;
}

/**
 * Options for `verifyJWT`.
 */
export interface VerifyJWTOptions {
  /** Storage adapter. */
  storage: AuthStorage;

  /**
   * Optional secret (HS256) or private key (EdDSA) bytes. If provided, uses
   * this secret to verify the signature (the kid in the JWT header is ignored).
   * Use this when the secret is known directly without a storage lookup (e.g.
   * for one-off verification or test scenarios).
   */
  secret?: Uint8Array;

  /**
   * Allowed audience(s). Token's `aud` claim must match at least one.
   * If omitted, audience is not checked.
   */
  audience?: string | string[];

  /**
   * Expected issuer. Token's `iss` claim must match exactly.
   * If omitted, issuer is not checked.
   */
  issuer?: string;

  /**
   * Allowed algorithms. Default: ["HS256"]. NEVER include "none" in this list.
   */
  algorithms?: JWTAlgorithm[];

  /**
   * Clock skew tolerance in seconds. Default: 5.
   * OWASP ASVS V3.5: max 30s recommended.
   */
  clockSkewSec?: number;

  /**
   * If true, expired tokens throw `AuthTokenExpiredError`. Default: true.
   * Set to false only for refresh flows that accept expired access tokens.
   */
  rejectExpired?: boolean;
}

/**
 * A single key in a JWKS (JSON Web Key Set) document.
 */
export interface JWK {
  /** Key type. "oct" for HS256, "OKP" for EdDSA. */
  kty: "oct" | "OKP";

  /** Key ID. Matches the `kid` JWT header. */
  kid: string;

  /** Algorithm. "HS256" or "EdDSA". */
  alg: JWTAlgorithm;

  /** Use. Always "sig" for OCAIS. */
  use: "sig";

  /** For OKP keys: the curve. "Ed25519". */
  crv?: "Ed25519";

  /** For OKP keys: base64url-encoded public key. */
  x?: string;
}

/**
 * JWKS document. Returned by `jwksPublish`.
 */
export interface JWKS {
  keys: JWK[];
}

// ─── Cookie ──────────────────────────────────────────────────────────────

/**
 * Cookie attributes. Defaults are conservative (HttpOnly, Secure, SameSite=Lax).
 */
export interface CookieAttributes {
  /** Domain (e.g. ".example.com" for subdomains). */
  domain?: string;

  /** Path. Default: "/". */
  path?: string;

  /** Secure flag. Default: true (recommended for production). */
  secure?: boolean;

  /** HttpOnly flag. Default: true (recommended; prevents XSS exfiltration). */
  httpOnly?: boolean;

  /**
   * SameSite policy. Default: "Lax".
   * "Strict" is most secure but breaks cross-site links.
   */
  sameSite?: "Strict" | "Lax" | "None";

  /**
   * Max-Age in seconds. Default: 604_800 (7 days).
   * Set to 0 to delete the cookie (consumer should set value to "").
   */
  maxAge?: number;
}

/**
 * Options for `cookieSign` and `cookieVerify`.
 */
export interface CookieOptions {
  /**
   * Secret used for HMAC + AES-GCM. 32+ bytes recommended.
   * Generate with `crypto.getRandomValues(new Uint8Array(32))` or similar.
   */
  secret: Uint8Array | string;

  /**
   * Cookie expiry in seconds. Default: 604_800 (7 days).
   * 0 = session cookie (deleted on browser close).
   */
  expiresInSec?: number;

  /**
   * Optional attributes to attach to the Set-Cookie header.
   * If omitted, `cookieSign` returns just the cookie value (no Set-Cookie
   * header); consumer must construct the header themselves.
   */
  attributes?: CookieAttributes;
}

// ─── Password ─────────────────────────────────────────────────────────────

/**
 * Argon2id parameters. OWASP-recommended minimums (2026):
 * - memory: 19 MB (19456 KiB)
 * - iterations: 2
 * - parallelism: 1
 *
 * Use `DEFAULT_ARGON2ID_PARAMS` for safe defaults.
 */
export interface Argon2idParams {
  /** Memory cost in KiB. Default: 19456. */
  memory?: number;

  /** Iterations (time cost). Default: 2. */
  iterations?: number;

  /** Parallelism. Default: 1. */
  parallelism?: number;
}

/**
 * Default Argon2id parameters per OWASP 2026 guidance.
 * Consumers can override but should NOT reduce these values.
 */
export const DEFAULT_ARGON2ID_PARAMS: Required<Argon2idParams> = {
  memory: 19_456,
  iterations: 2,
  parallelism: 1,
};

/**
 * Options for `passwordHash` and `passwordVerify`.
 */
export interface PasswordOptions {
  /**
   * Argon2id parameters. If omitted, uses `DEFAULT_ARGON2ID_PARAMS`.
   * For new hashes only; `passwordVerify` ignores this and reads params
   * from the stored hash.
   */
  params?: Argon2idParams;
}

// ─── Rate limit ───────────────────────────────────────────────────────────

/**
 * Result of a rate-limit check.
 */
export interface RateLimitResult {
  /** True if the request is within limits. */
  allowed: boolean;

  /** Remaining quota in the current window. */
  remaining: number;

  /**
   * Timestamp (ms since epoch) when the current window resets.
   * Consumer can use this to set `Retry-After` header.
   */
  resetAt: number;
}

/**
 * Options for `rateLimit` and `createRateLimiter`.
 */
export interface RateLimitOptions {
  /**
   * Unique key identifying the rate-limited entity (e.g. email, IP, user ID).
   * Hash the key with `hmacSha256(key, secret)` before using if it contains PII.
   */
  key: string;

  /**
   * Max requests allowed per window. Must be ≥ 1.
   */
  max: number;

  /**
   * Window duration in milliseconds.
   * E.g. 60_000 (1 min), 3_600_000 (1 hour), 86_400_000 (1 day).
   */
  windowMs: number;

  /**
   * Optional storage adapter. If omitted, uses an in-memory Map (per-process,
   * not shared across Lambda invocations).
   */
  storage?: AuthStorage;
}

// ─── Result types (for error handling) ───────────────────────────────────

/**
 * Result type for primitives that can fail in a structured way.
 * Use `isOk` / `isErr` to discriminate.
 */
export type Result<T, E = AuthError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok === true;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return r.ok === false;
}
