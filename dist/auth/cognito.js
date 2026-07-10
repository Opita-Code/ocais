/**
 * OCAIS Auth — Cognito JWT verification
 *
 * High-level module that verifies AWS Cognito JWTs (ID tokens and access
 * tokens) using RS256 with RSA keys from Cognito's public JWKS endpoint.
 *
 * Usage:
 *   import { verifyCognitoJWT } from "@opita/ocais/auth/cognito";
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
import { AuthTokenInvalidError, AuthTokenExpiredError } from "./errors.js";
const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLOCK_SKEW_SEC = 30;
const _cache = new Map();
const _pendingFetches = new Map();
function _cacheKey(region, userPoolId) {
    return `${region}/${userPoolId}`;
}
function _jwksUrl(region, userPoolId) {
    return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
}
async function _fetchJWKS(region, userPoolId, fetchFn) {
    const key = _cacheKey(region, userPoolId);
    // Dedupe concurrent cold-start fetches
    const existing = _pendingFetches.get(key);
    if (existing)
        return existing;
    const promise = (async () => {
        const url = _jwksUrl(region, userPoolId);
        const response = await fetchFn(url);
        if (!response.ok) {
            throw new AuthTokenInvalidError(`JWKS fetch failed: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json());
        const cache = { keys: data.keys, fetchedAt: Date.now() };
        _cache.set(key, cache);
        return cache;
    })();
    _pendingFetches.set(key, promise);
    try {
        return await promise;
    }
    finally {
        _pendingFetches.delete(key);
    }
}
async function _getKeyByKid(kid, region, userPoolId, fetchFn) {
    const key = _cacheKey(region, userPoolId);
    const cached = _cache.get(key);
    // If cache is empty or too old, refresh
    if (!cached || Date.now() - cached.fetchedAt > JWKS_CACHE_TTL_MS) {
        await _fetchJWKS(region, userPoolId, fetchFn);
    }
    const fresh = _cache.get(key);
    if (!fresh) {
        throw new AuthTokenInvalidError("JWKS cache empty after refresh");
    }
    // Find key by kid
    const jwk = fresh.keys.find((k) => k.kid === kid);
    if (jwk)
        return jwk;
    // Kid not found — maybe keys rotated. Refresh cache and try again.
    await _fetchJWKS(region, userPoolId, fetchFn);
    const retry = _cache.get(key)?.keys.find((k) => k.kid === kid);
    if (!retry) {
        throw new AuthTokenInvalidError(`JWK with kid "${kid}" not found after refresh. Available kids: ${(_cache.get(key)?.keys ?? []).map((k) => k.kid).join(", ")}`);
    }
    return retry;
}
/**
 * Reset the JWKS cache for a specific pool (for testing).
 */
export function _resetCache(region, userPoolId) {
    if (region && userPoolId) {
        _cache.delete(_cacheKey(region, userPoolId));
        _pendingFetches.delete(_cacheKey(region, userPoolId));
    }
    else {
        _cache.clear();
        _pendingFetches.clear();
    }
}
/**
 * Get cache stats (for diagnostics and testing).
 */
export function _cacheStats() {
    const pools = [];
    let totalKeys = 0;
    _cache.forEach((cache, key) => {
        const [region, userPoolId] = key.split("/");
        const ageMs = Date.now() - cache.fetchedAt;
        pools.push({ region, userPoolId, keyCount: cache.keys.length, ageMs });
        totalKeys += cache.keys.length;
    });
    return { poolCount: pools.length, totalKeys, pools };
}
// ─── Base64 helpers ──────────────────────────────────────────────────────
function base64UrlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4)
        str += "=";
    const binaryStr = globalThis.atob(str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
}
function base64UrlDecodeString(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4)
        str += "=";
    return globalThis.atob(str);
}
// ─── Signature verification ──────────────────────────────────────────────
/**
 * Verifies an RS256 signature using a JWK RSA public key (n, e).
 */
async function verifyRS256(data, signature, n, e) {
    const cryptoKey = await globalThis.crypto.subtle.importKey("jwk", { kty: "RSA", n, e, alg: "RS256" }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return globalThis.crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, cryptoKey, signature, data);
}
// ─── Public API ──────────────────────────────────────────────────────────
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
export async function verifyCognitoJWT(token, options) {
    const { region, userPoolId, tokenUse, clientId, fetchFn = globalThis.fetch, } = options;
    if (!token || typeof token !== "string") {
        throw new AuthTokenInvalidError("Token must be a non-empty string");
    }
    // 1. Split JWT
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new AuthTokenInvalidError(`JWT must have 3 parts, got ${parts.length}`);
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    // 2. Decode and validate header
    let header;
    try {
        header = JSON.parse(base64UrlDecodeString(headerB64));
    }
    catch {
        throw new AuthTokenInvalidError("JWT header is not valid JSON");
    }
    if (!header.alg || header.alg !== "RS256") {
        throw new AuthTokenInvalidError(`JWT alg must be "RS256", got "${header.alg ?? "(none)"}"`);
    }
    if (header.typ && header.typ !== "JWT") {
        throw new AuthTokenInvalidError(`JWT typ must be "JWT", got "${header.typ}"`);
    }
    if (!header.kid) {
        throw new AuthTokenInvalidError("JWT missing kid in header");
    }
    // 3. Decode and validate payload
    let payload;
    try {
        payload = JSON.parse(base64UrlDecodeString(payloadB64));
    }
    catch {
        throw new AuthTokenInvalidError("JWT payload is not valid JSON");
    }
    // 4. Validate token_use
    if (tokenUse && payload.token_use !== tokenUse) {
        throw new AuthTokenInvalidError(`token_use mismatch: expected "${tokenUse}", got "${payload.token_use}"`);
    }
    // 5. Validate issuer
    const expectedIss = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    if (payload.iss && payload.iss !== expectedIss) {
        throw new AuthTokenInvalidError(`Issuer mismatch: expected "${expectedIss}", got "${payload.iss}"`);
    }
    // 6. Validate audience/client_id
    if (tokenUse === "id" && clientId) {
        const aud = payload.aud;
        const audList = Array.isArray(aud) ? aud : [aud];
        if (!audList.includes(clientId)) {
            throw new AuthTokenInvalidError(`Audience mismatch: expected "${clientId}", got "${aud}"`);
        }
    }
    else if (tokenUse === "access" && clientId) {
        // Access tokens use client_id claim instead of aud
        if (payload.client_id !== clientId) {
            throw new AuthTokenInvalidError(`client_id mismatch: expected "${clientId}", got "${payload.client_id}"`);
        }
    }
    // 7. Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp + CLOCK_SKEW_SEC < now) {
        throw new AuthTokenExpiredError(payload.exp);
    }
    // 8. Validate nbf (if present)
    if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_SEC > now) {
        throw new AuthTokenInvalidError(`Token not yet valid. nbf: ${payload.nbf}, now: ${now}`);
    }
    // 9. Get JWK by kid
    const jwk = await _getKeyByKid(header.kid, region, userPoolId, fetchFn);
    // 10. Verify signature
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);
    const valid = await verifyRS256(data, signature, jwk.n, jwk.e);
    if (!valid) {
        throw new AuthTokenInvalidError("JWT signature is invalid");
    }
    return payload;
}
/**
 * Forced JWKS refresh (for testing or manual rotation).
 */
export async function _refreshJWKS(region, userPoolId, fetchFn) {
    await _fetchJWKS(region, userPoolId, fetchFn ?? globalThis.fetch);
}
//# sourceMappingURL=cognito.js.map