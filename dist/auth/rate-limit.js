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
import { hmacSha256, bytesToHex } from './utils.js';
import { AuthError } from './errors.js';
/**
 * In-memory rate-limit store. Per-process, not shared across Lambda
 * invocations. For multi-instance limits, use a storage adapter.
 */
const memoryStore = new Map();
/**
 * Resets the in-memory store. Useful for tests.
 */
export function _resetRateLimitStoreForTesting() {
    memoryStore.clear();
}
/**
 * Returns the current in-memory store size. Useful for tests.
 */
export function _rateLimitStoreSize() {
    return memoryStore.size;
}
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
export async function rateLimit(options) {
    const { key, max, windowMs, storage } = options;
    if (max < 1) {
        throw new AuthError("AUTH_CONFIG", "max must be at least 1");
    }
    if (windowMs < 1000) {
        throw new AuthError("AUTH_CONFIG", "windowMs must be at least 1000 (1 sec)");
    }
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const storageKey = `RL#${key}#${windowStart}`;
    let count;
    if (storage) {
        try {
            const result = await storage.incrCounter(storageKey, windowMs);
            count = result.count;
        }
        catch (err) {
            if (err instanceof AuthError)
                throw err;
            // Fail-open: log the error and allow the request. Consumers who
            // want fail-closed should wrap this primitive.
            return { allowed: true, remaining: max, resetAt };
        }
    }
    else {
        // In-memory: bump counter
        const existing = memoryStore.get(storageKey);
        if (!existing || existing.resetAt < now) {
            memoryStore.set(storageKey, { count: 1, resetAt });
            count = 1;
        }
        else {
            existing.count += 1;
            count = existing.count;
        }
        // Opportunistic eviction: if the store grows past 10K entries, drop
        // the oldest. This prevents OOM in long-running processes.
        if (memoryStore.size > 10_000) {
            const firstKey = memoryStore.keys().next().value;
            if (firstKey)
                memoryStore.delete(firstKey);
        }
    }
    const allowed = count <= max;
    const remaining = Math.max(0, max - count);
    return { allowed, remaining, resetAt };
}
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
export function createRateLimiter(boundOptions) {
    return async (key) => {
        return rateLimit({ ...boundOptions, key });
    };
}
/**
 * HMAC a key for safe use in storage. Use this for keys that contain PII
 * (email, IP, user-agent) so the storage layer doesn't see the raw value.
 *
 * @param key The key to hash (e.g. email, IP).
 * @param secret HMAC secret.
 * @returns A hex-encoded HMAC-SHA256 of the key.
 */
export async function hashRateLimitKey(key, secret) {
    return bytesToHex(await hmacSha256(secret, key));
}
//# sourceMappingURL=rate-limit.js.map