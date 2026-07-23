/**
 * OCAIS Auth — Cognito JWT verification
 *
 * High-level module that verifies AWS Cognito JWTs (ID tokens and access
 * tokens) using RS256 with RSA keys from Cognito's public JWKS endpoint.
 *
 * Usage:
 *   import { verifyCognitoJWT } from "@opitacode/ocais/auth/cognito";
 *
 *   const claims = await verifyCognitoJWT(token, {
 *     userPoolId: "us-east-1_abc123",
 *     region: "us-east-1",
 *     tokenUse: "id",          // "id" | "access" | undefined
 *     clientId: "4b5sluoilcrtuq67qbu4528htl", // required for id tokens
 *   });
 *
 * The JWKS is cached in-memory with a 24-hour TTL and auto-refreshes on
 * cache-miss (key rotation detection).
 *
 * Security:
 * - Algorithm allow-list: RS256 only (rejects none, HS256, EdDSA)
 * - CVE-2015-9235 protection: explicit reject of "none" algorithm
 * - `kid`-based key lookup with refresh-on-miss (key rotation safe)
 * - `exp`, `nbf`, `iss`, `aud` validation per OWASP ASVS V3.5
 * - Clock skew tolerance: 30 seconds
 */
import type { JWTClaims } from "./types.js";
export interface CognitoOptions {
    /** AWS region, e.g. "us-east-1". */
    region: string;
    /** Cognito User Pool ID, e.g. "us-east-1_abc123". */
    userPoolId: string;
    /**
     * Expected token_use claim.
     * - "id" — ID token (requires clientId for aud validation)
     * - "access" — access token
     * - undefined — skip token_use check
     */
    tokenUse?: "id" | "access";
    /**
     * Cognito App Client ID. Required for ID tokens (validates `aud` claim).
     * For access tokens, the `client_id` claim is checked instead.
     */
    clientId?: string;
    /**
     * Optional: custom fetch function (default: globalThis.fetch).
     * Useful for testing or environments without global fetch.
     */
    fetchFn?: typeof globalThis.fetch;
}
export interface CognitoClaims extends JWTClaims {
    /** Token use: "id" or "access". */
    token_use: string;
    /** Cognito username (usually the sub). */
    "cognito:username"?: string;
    /** User attributes (present on ID tokens). */
    email?: string;
    email_verified?: string;
    phone_number?: string;
    phone_number_verified?: string;
    /** Cognito groups (if configured). */
    "cognito:groups"?: string[];
    /** Custom attributes (prefixed with "custom:"). */
    [key: string]: unknown;
}
/**
 * Reset the JWKS cache for a specific pool (for testing).
 */
export declare function _resetCache(region?: string, userPoolId?: string): void;
/**
 * Get cache stats (for diagnostics and testing).
 */
export declare function _cacheStats(): {
    poolCount: number;
    totalKeys: number;
    pools: Array<{
        region: string;
        userPoolId: string;
        keyCount: number;
        ageMs: number;
    }>;
};
/**
 * Verifies an AWS Cognito JWT locally.
 *
 * Fetches the JWKS from Cognito's public endpoint, caches it, and uses
 * Web Crypto API (RS256 via RSASSA-PKCS1-v1_5 + SHA-256) to verify the
 * signature. No external HTTP calls after the initial JWKS fetch.
 *
 * @param token The Cognito JWT string (ID token or access token).
 * @param options Configuration: region, userPoolId, tokenUse, clientId.
 * @returns Decoded claims if valid.
 * @throws AuthTokenInvalidError on bad signature, alg confusion, etc.
 * @throws AuthTokenExpiredError if the token is expired.
 */
export declare function verifyCognitoJWT(token: string, options: CognitoOptions): Promise<CognitoClaims>;
/**
 * Forced JWKS refresh (for testing or manual rotation).
 */
export declare function _refreshJWKS(region: string, userPoolId: string, fetchFn?: typeof globalThis.fetch): Promise<void>;
//# sourceMappingURL=cognito.d.ts.map