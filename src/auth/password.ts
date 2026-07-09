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

import { AuthError } from './errors.js';
import { DEFAULT_ARGON2ID_PARAMS, type Argon2idParams, type PasswordOptions } from './types.js';

/**
 * Lazy import of @node-rs/argon2. If not installed, this module throws.
 */
// @ts-ignore — optional peer-dep, may not be installed
let argon2Module: any = null;
async function getArgon2(): Promise<any> {
  if (argon2Module) return argon2Module;
  try {
    // @ts-ignore — optional peer-dep
    argon2Module = await import("@node-rs/argon2");
    return argon2Module;
  } catch {
    throw new AuthError(
      "AUTH_DEPENDENCY",
      "passwordHash/passwordVerify require @node-rs/argon2 to be installed (npm install @node-rs/argon2)",
    );
  }
}

/**
 * Hashes a password using Argon2id with the given parameters (or defaults).
 *
 * @param password The plaintext password.
 * @param options Optional parameters. Defaults to OWASP-recommended values.
 * @returns The encoded hash (standard Argon2 format).
 */
export async function passwordHash(
  password: string,
  options: PasswordOptions = {},
): Promise<string> {
  const params: Required<Argon2idParams> = {
    memory: options.params?.memory ?? DEFAULT_ARGON2ID_PARAMS.memory,
    iterations: options.params?.iterations ?? DEFAULT_ARGON2ID_PARAMS.iterations,
    parallelism: options.params?.parallelism ?? DEFAULT_ARGON2ID_PARAMS.parallelism,
  };

  const argon2 = await getArgon2();
  return argon2.hash(password, {
    algorithm: argon2.Algorithm.Argon2id,
    memoryCost: params.memory,
    timeCost: params.iterations,
    parallelism: params.parallelism,
  });
}

/**
 * Verifies a password against a stored Argon2id hash. Constant-time.
 *
 * @param hash The stored hash (from `passwordHash`).
 * @param password The plaintext password to check.
 * @returns `true` if the password matches, `false` otherwise.
 */
export async function passwordVerify(hash: string, password: string): Promise<boolean> {
  const argon2 = await getArgon2();
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash → reject
    return false;
  }
}

/**
 * Returns the parameters used to generate a stored hash.
 * Useful for parameter migration (e.g. re-hash with new params on next login).
 */
export async function paramsFromHash(
  hash: string,
): Promise<{ memory: number; iterations: number; parallelism: number; version: number } | null> {
  // Argon2 format: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
  const parts = hash.split("$");
  if (parts.length !== 6 || !parts[1]?.startsWith("argon2")) {
    return null;
  }
  const version = parseInt(parts[2]?.substring(2) ?? "0", 10);
  if (Number.isNaN(version)) return null;
  const paramsStr = parts[3] ?? "";
  const params: Record<string, number> = {};
  for (const p of paramsStr.split(",")) {
    const [k, v] = p.split("=");
    if (k && v) params[k] = parseInt(v, 10);
  }
  return {
    memory: params.m ?? 0,
    iterations: params.t ?? 0,
    parallelism: params.p ?? 1,
    version,
  };
}

/**
 * Checks if a stored hash uses parameters below the current OWASP
 * recommendation. If so, the consumer should re-hash on next successful
 * login ("lazy migration").
 */
export async function needsRehash(hash: string, recommended?: Argon2idParams): Promise<boolean> {
  const current = await paramsFromHash(hash);
  if (!current) return true;
  const target = recommended ?? DEFAULT_ARGON2ID_PARAMS;
  return (
    current.memory < target.memory! ||
    current.iterations < target.iterations! ||
    current.parallelism < target.parallelism!
  );
}
