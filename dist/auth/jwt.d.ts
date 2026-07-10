/**
 * OCAIS Auth — JWT primitive
 *
 * Pure RFC 7519 (JWT) + RFC 7515 (JWS) implementation for HS256 and EdDSA.
 * No deps for HS256. Optional peer-dep `@noble/ed25519` for EdDSA.
 *
 * Security properties:
 * - Algorithm allow-list: rejects `none` and unknown algs (CVE-2015-9235).
 * - Constant-time signature verification (no early returns).
 * - Strict claim validation: `exp`, `nbf`, `iss`, `aud` (when configured).
 * - Key rotation: `rotateKeys` generates new key, marks old as deprecated.
 *   Verification accepts both active and deprecated keys (24h grace).
 *
 * OWASP ASVS coverage:
 * - V3.5.1: Verify JWT alg matches expected (prevent `none` confusion)
 * - V3.5.2: Verify JWT signature with expected key
 * - V3.5.3: Verify JWT `exp`, `nbf`, `iss`, `aud`
 * - V3.5.4: Reject JWT with `kid` not in JWKS
 */
import type { AuthStorage, JWTClaims, JWTAlgorithm, SignJWTOptions, VerifyJWTOptions, JWKS } from './types.js';
/**
 * Verifies an RS256 signature using a JWK-formatted RSA public key.
 * Use this when the key comes from an external JWKS endpoint (Cognito,
 * Auth0, Google) in JWK format rather than raw SPKI bytes.
 */
export declare function rs256VerifyJWK(signingInput: string, signature: Uint8Array, jwk: {
    n: string;
    e: string;
}): Promise<boolean>;
interface JWTHeader {
    alg: JWTAlgorithm;
    typ: "JWT";
    kid?: string;
}
/**
 * Signs a JWT and returns the compact serialization.
 *
 * Uses the active key from storage by default. If `secret` is provided, uses
 * that secret (with `keyId` as the `kid` header). If `keyId` is provided but no
 * `secret`, loads the key from storage.
 *
 * @param claims Required claims: `sub`. Optional: `iss`, `aud`, `iat`, `exp`,
 *   `nbf`, `jti`, plus any custom claims.
 * @param options Storage, secret/alg, expiresInSec, etc.
 * @returns The signed JWT (compact serialization: header.payload.signature).
 * @throws AuthTokenInvalidError if claims are missing required fields.
 * @throws AuthStorageError if storage fails.
 * @throws AuthError if algorithm/secret is missing.
 */
export declare function signJWT(claims: JWTClaims, options: SignJWTOptions): Promise<{
    token: string;
    keyId: string;
}>;
/**
 * Verifies a JWT and returns its claims.
 *
 * Validates:
 * - Algorithm is in the allow-list (default: HS256; EdDSA allowed if listed).
 *   `none` is NEVER accepted.
 * - Signature is valid (using the key indicated by `kid`).
 * - `exp` is in the future (within `clockSkewSec`).
 * - `nbf` is in the past (within `clockSkewSec`).
 * - `iss` matches `issuer` (if provided).
 * - `aud` contains `audience` (if provided).
 *
 * @param token The compact JWT.
 * @param options Storage, audience, issuer, algorithms, clockSkewSec.
 * @returns The JWT claims.
 * @throws AuthTokenInvalidError on signature failure, alg confusion, or
 *   claim mismatch.
 * @throws AuthTokenExpiredError if `exp` is in the past.
 * @throws AuthTokenNotYetValidError if `nbf` is in the future.
 * @throws AuthTokenAudienceError if `aud` doesn't match.
 * @throws AuthTokenIssuerError if `iss` doesn't match.
 */
export declare function verifyJWT(token: string, options: VerifyJWTOptions): Promise<JWTClaims>;
/**
 * Generates a new signing key, marks the previous active key as deprecated
 * (24h grace period), and returns the new key ID.
 *
 * If no active key exists (first rotation), `deprecatedKeyId` is null.
 *
 * Implementations should:
 * 1. Generate a new 32-byte secret (or 32-byte EdDSA private key, or RSA keypair).
 * 2. Store the new key as active.
 * 3. Mark the old key as deprecated (still valid for verify, but not for sign).
 *
 * @returns `{ newKeyId, deprecatedKeyId }`.
 */
export declare function rotateKeys(options: {
    storage: AuthStorage;
    alg?: JWTAlgorithm;
}): Promise<{
    newKeyId: string;
    deprecatedKeyId: string | null;
}>;
/**
 * Returns the JWKS (JSON Web Key Set) for public verification.
 *
 * Filters by algorithm (default: only the requested alg). For HS256, the
 * public JWKS does NOT include the symmetric secret (would be a security
 * disaster). Only EdDSA keys are exposed publicly.
 *
 * @returns JWKS document.
 */
export declare function jwksPublish(options: {
    storage: AuthStorage;
    alg?: JWTAlgorithm;
}): Promise<JWKS>;
/**
 * Returns the current Unix timestamp in seconds.
 */
export declare function nowSec(): number;
/**
 * Computes a future Unix timestamp.
 */
export declare function futureSec(seconds: number): number;
/**
 * Decodes a JWT without verifying the signature. Useful for debugging.
 * NEVER use this in security-sensitive code paths.
 */
export declare function decodeJWTUnsafe(token: string): {
    header: JWTHeader;
    claims: JWTClaims;
};
export {};
//# sourceMappingURL=jwt.d.ts.map