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
export declare class AuthError extends Error {
    readonly code: string;
    readonly cause?: unknown;
    constructor(code: string, message: string, cause?: unknown);
}
/**
 * Magic-link token is invalid, expired, already used, or storage miss.
 * Maps to HTTP 400 (bad request) at the edge.
 */
export declare class AuthMagicLinkInvalidError extends AuthError {
    constructor(message?: string, cause?: unknown);
}
/**
 * JWT signature is invalid, alg confusion, or tampering detected.
 * Maps to HTTP 401.
 */
export declare class AuthTokenInvalidError extends AuthError {
    constructor(message?: string, cause?: unknown);
}
/**
 * JWT has expired (`exp` claim in the past). Consumer should refresh or re-auth.
 * Maps to HTTP 401 with `WWW-Authenticate: Bearer error="invalid_token", error_description="The access token expired"`.
 */
export declare class AuthTokenExpiredError extends AuthError {
    readonly expiredAt: number;
    constructor(expiredAt: number, message?: string);
}
/**
 * JWT `nbf` (not before) claim is in the future. Token is not yet valid.
 * Maps to HTTP 401.
 */
export declare class AuthTokenNotYetValidError extends AuthError {
    readonly notBefore: number;
    constructor(notBefore: number);
}
/**
 * JWT `aud` (audience) doesn't match the expected audience. Possible token reuse across services.
 * Maps to HTTP 401.
 */
export declare class AuthTokenAudienceError extends AuthError {
    readonly expected: string;
    readonly actual: string;
    constructor(expected: string, actual: string);
}
/**
 * JWT `iss` (issuer) doesn't match the expected issuer.
 * Maps to HTTP 401.
 */
export declare class AuthTokenIssuerError extends AuthError {
    readonly expected: string;
    readonly actual: string;
    constructor(expected: string, actual: string);
}
/**
 * Cookie signature is invalid, tampered, or expired.
 * Maps to HTTP 401.
 */
export declare class AuthCookieInvalidError extends AuthError {
    constructor(message?: string, cause?: unknown);
}
/**
 * Password verification failed (wrong password). Consumer should NOT log the
 * attempted password; only log a hash of the email for rate-limit tracking.
 * Maps to HTTP 401.
 */
export declare class AuthPasswordInvalidError extends AuthError {
    constructor(message?: string);
}
/**
 * Rate limit exceeded for the given key. Consumer should respond with HTTP 429
 * and `Retry-After` header.
 */
export declare class AuthRateLimitError extends AuthError {
    readonly retryAfterMs: number;
    readonly limit: number;
    readonly key: string;
    constructor(key: string, limit: number, retryAfterMs: number);
}
/**
 * Storage adapter error (DDB throttling, network, etc.). Consumer should retry
 * with backoff. Maps to HTTP 503.
 */
export declare class AuthStorageError extends AuthError {
    constructor(message: string, cause?: unknown);
}
/**
 * Cryptographic key error (missing, wrong length, malformed). Indicates a
 * misconfiguration; not user-facing.
 */
export declare class AuthKeyError extends AuthError {
    constructor(message: string, cause?: unknown);
}
/**
 * Returns true if the error is an `AuthError` (or subclass).
 * Useful for `try/catch` boundaries.
 */
export declare function isAuthError(err: unknown): err is AuthError;
//# sourceMappingURL=errors.d.ts.map