/**
 * OCAIS Auth — shared types
 *
 * All types are exported via `@opita/ocais/auth`. Consumers implement the
 * `AuthStorage` interface to plug in their backend (DDB, Redis, etc.).
 */
/**
 * Default Argon2id parameters per OWASP 2026 guidance.
 * Consumers can override but should NOT reduce these values.
 */
export const DEFAULT_ARGON2ID_PARAMS = {
    memory: 19_456,
    iterations: 2,
    parallelism: 1,
};
export function isOk(r) {
    return r.ok === true;
}
export function isErr(r) {
    return r.ok === false;
}
//# sourceMappingURL=types.js.map