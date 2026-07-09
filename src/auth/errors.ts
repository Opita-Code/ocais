/**
 * OCAIS Auth — typed error hierarchy
 *
 * All OCAIS auth errors extend `AuthError` for `instanceof` checks.
 * Each error carries a `code` for log grouping and an optional `cause` for debugging.
 */

/**
 * Base class for all OCAIS auth errors. Use `instanceof AuthError` to catch any
 * auth-related failure.
 */
export class AuthError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Magic-link token is invalid, expired, already used, or storage miss.
 * Maps to HTTP 400 (bad request) at the edge.
 */
export class AuthMagicLinkInvalidError extends AuthError {
  constructor(message = "Magic-link token is invalid or expired", cause?: unknown) {
    super("AUTH_MAGIC_LINK_INVALID", message, cause);
    this.name = "AuthMagicLinkInvalidError";
  }
}

/**
 * JWT signature is invalid, alg confusion, or tampering detected.
 * Maps to HTTP 401.
 */
export class AuthTokenInvalidError extends AuthError {
  constructor(message = "Token signature or format is invalid", cause?: unknown) {
    super("AUTH_TOKEN_INVALID", message, cause);
    this.name = "AuthTokenInvalidError";
  }
}

/**
 * JWT has expired (`exp` claim in the past). Consumer should refresh or re-auth.
 * Maps to HTTP 401 with `WWW-Authenticate: Bearer error="invalid_token", error_description="The access token expired"`.
 */
export class AuthTokenExpiredError extends AuthError {
  readonly expiredAt: number;

  constructor(expiredAt: number, message?: string) {
    super(
      "AUTH_TOKEN_EXPIRED",
      message ?? `Token expired at ${new Date(expiredAt * 1000).toISOString()}`,
    );
    this.name = "AuthTokenExpiredError";
    this.expiredAt = expiredAt;
  }
}

/**
 * JWT `nbf` (not before) claim is in the future. Token is not yet valid.
 * Maps to HTTP 401.
 */
export class AuthTokenNotYetValidError extends AuthError {
  readonly notBefore: number;

  constructor(notBefore: number) {
    super(
      "AUTH_TOKEN_NOT_YET_VALID",
      `Token not valid until ${new Date(notBefore * 1000).toISOString()}`,
    );
    this.name = "AuthTokenNotYetValidError";
    this.notBefore = notBefore;
  }
}

/**
 * JWT `aud` (audience) doesn't match the expected audience. Possible token reuse across services.
 * Maps to HTTP 401.
 */
export class AuthTokenAudienceError extends AuthError {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(
      "AUTH_TOKEN_AUDIENCE",
      `Token audience mismatch: expected "${expected}", got "${actual}"`,
    );
    this.name = "AuthTokenAudienceError";
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * JWT `iss` (issuer) doesn't match the expected issuer.
 * Maps to HTTP 401.
 */
export class AuthTokenIssuerError extends AuthError {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(
      "AUTH_TOKEN_ISSUER",
      `Token issuer mismatch: expected "${expected}", got "${actual}"`,
    );
    this.name = "AuthTokenIssuerError";
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Cookie signature is invalid, tampered, or expired.
 * Maps to HTTP 401.
 */
export class AuthCookieInvalidError extends AuthError {
  constructor(message = "Cookie signature invalid or expired", cause?: unknown) {
    super("AUTH_COOKIE_INVALID", message, cause);
    this.name = "AuthCookieInvalidError";
  }
}

/**
 * Password verification failed (wrong password). Consumer should NOT log the
 * attempted password; only log a hash of the email for rate-limit tracking.
 * Maps to HTTP 401.
 */
export class AuthPasswordInvalidError extends AuthError {
  constructor(message = "Invalid email or password") {
    // Intentionally generic to prevent user enumeration.
    super("AUTH_PASSWORD_INVALID", message);
    this.name = "AuthPasswordInvalidError";
  }
}

/**
 * Rate limit exceeded for the given key. Consumer should respond with HTTP 429
 * and `Retry-After` header.
 */
export class AuthRateLimitError extends AuthError {
  readonly retryAfterMs: number;
  readonly limit: number;
  readonly key: string;

  constructor(key: string, limit: number, retryAfterMs: number) {
    super(
      "AUTH_RATE_LIMIT",
      `Rate limit exceeded for key "${key}" (limit: ${limit}, retry after: ${retryAfterMs}ms)`,
    );
    this.name = "AuthRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.limit = limit;
    this.key = key;
  }
}

/**
 * Storage adapter error (DDB throttling, network, etc.). Consumer should retry
 * with backoff. Maps to HTTP 503.
 */
export class AuthStorageError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super("AUTH_STORAGE", message, cause);
    this.name = "AuthStorageError";
  }
}

/**
 * Cryptographic key error (missing, wrong length, malformed). Indicates a
 * misconfiguration; not user-facing.
 */
export class AuthKeyError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super("AUTH_KEY", message, cause);
    this.name = "AuthKeyError";
  }
}

/**
 * Returns true if the error is an `AuthError` (or subclass).
 * Useful for `try/catch` boundaries.
 */
export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}
