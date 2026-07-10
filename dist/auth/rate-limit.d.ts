/**
 * OCAIS Auth — rate-limit primitive
 *
 * In-memory rate limiter with optional storage adapter for cross-instance
 * coordination. Implements a fixed-window algorithm.
 *
 * Security properties:
 * - Constant-time checks (no early-return based on counter value).
 * - Keys are HMAC'd before use if they contain PII.
 * - Fail-open: storage errors don't break the request, just log a warning.
 *   (Alternative: fail-closed. OCAIS defaults to fail-open; consumers can
 *   override by wrapping this primitive.)
 *
 * OWASP ASVS coverage:
 * - V2.2.1: Anti-automation (rate limit on auth endpoints)
 * - V11.1.4: Rate limiting per IP/user/resource
 */
import type { RateLimitOptions, RateLimitResult } from './types.js';
/**
 * Resets the in-memory store. Useful for tests.
 */
export declare function _resetRateLimitStoreForTesting(): void;
/**
 * Returns the current in-memory store size. Useful for tests.
 */
export declare function _rateLimitStoreSize(): number;
/**
 * Checks if a request is within the rate limit. Increments the counter
 * atomically and returns the result.
 *
 * Algorithm: fixed window. Each call to `rateLimit` increments the counter
 * for the given key. If the counter exceeds `max`, throws `AuthRateLimitError`.
 *
 * @throws AuthRateLimitError if the limit is exceeded (when used with throw-on-exceed).
 * @returns `RateLimitResult` with `allowed`, `remaining`, `resetAt`.
 */
export declare function rateLimit(options: RateLimitOptions): Promise<RateLimitResult>;
/**
 * Creates a reusable rate-limit function with bound options.
 * Useful for hot-path usage where the same limit is checked many times.
 *
 * @example
 *   const limiter = createRateLimiter({ max: 100, windowMs: 60_000, storage });
 *   for (const req of requests) {
 *     const result = await limiter(req.ip);
 *     if (!result.allowed) return res.status(429).send("Too Many Requests");
 *   }
 */
export declare function createRateLimiter(boundOptions: Omit<RateLimitOptions, "key">): (key: string) => Promise<RateLimitResult>;
/**
 * HMAC a key for safe use in storage. Use this for keys that contain PII
 * (email, IP, user-agent) so the storage layer doesn't see the raw value.
 *
 * @param key The key to hash (e.g. email, IP).
 * @param secret HMAC secret.
 * @returns A hex-encoded HMAC-SHA256 of the key.
 */
export declare function hashRateLimitKey(key: string, secret: string | Uint8Array): Promise<string>;
//# sourceMappingURL=rate-limit.d.ts.map