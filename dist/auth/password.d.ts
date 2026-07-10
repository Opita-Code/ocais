/**
 * OCAIS Auth — password hashing primitive
 *
 * Argon2id via `@node-rs/argon2` (optional peer-dep). We DO NOT ship our own
 * Argon2 implementation — memory-hard hashing is too easy to get wrong.
 *
 * Security properties:
 * - OWASP-recommended parameters: memory=19MB, iterations=2, parallelism=1.
 *   These are tuned for server-side (Lambda) workloads.
 * - Constant-time compare (built into Argon2id).
 * - Per-password salt (built into Argon2id).
 * - Standard encoded format: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`.
 *   Compatible with all Argon2 reference implementations.
 *
 * Why we refuse to reimplement:
 * - Argon2id's memory-hardness is the security feature. A "pure JS"
 *   implementation would not be memory-hard (JS engines don't give
 *   predictable memory access). Sub-100ms in a JS implementation would be
 *   ~1000x weaker than the C/Rust reference.
 * - Constant-time side-channel resistance requires careful implementation
 *   that varies across CPU architectures. We don't have the bandwidth to
 *   audit that.
 *
 * OWASP ASVS coverage:
 * - V2.1.1: Verify users against stored credentials
 * - V6.2.4: Use approved password hashing (Argon2id, bcrypt, scrypt, PBKDF2)
 * - V6.3.1: Use cryptographically secure random (via @node-rs/argon2)
 *
 * Optional peer-dep:
 *   npm install @node-rs/argon2
 */
import { type Argon2idParams, type PasswordOptions } from './types.js';
/**
 * Hashes a password using Argon2id with the given parameters (or defaults).
 *
 * @param password The plaintext password.
 * @param options Optional parameters. Defaults to OWASP-recommended values.
 * @returns The encoded hash (standard Argon2 format).
 */
export declare function passwordHash(password: string, options?: PasswordOptions): Promise<string>;
/**
 * Verifies a password against a stored Argon2id hash. Constant-time.
 *
 * @param hash The stored hash (from `passwordHash`).
 * @param password The plaintext password to check.
 * @returns `true` if the password matches, `false` otherwise.
 */
export declare function passwordVerify(hash: string, password: string): Promise<boolean>;
/**
 * Returns the parameters used to generate a stored hash.
 * Useful for parameter migration (e.g. re-hash with new params on next login).
 */
export declare function paramsFromHash(hash: string): Promise<{
    memory: number;
    iterations: number;
    parallelism: number;
    version: number;
} | null>;
/**
 * Checks if a stored hash uses parameters below the current OWASP
 * recommendation. If so, the consumer should re-hash on next successful
 * login ("lazy migration").
 */
export declare function needsRehash(hash: string, recommended?: Argon2idParams): Promise<boolean>;
//# sourceMappingURL=password.d.ts.map