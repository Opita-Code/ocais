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

import {
  randomBase64Url,
  base64UrlEncode,
  base64UrlDecode,
  hmacSha256,
  constantTimeEqual,
} from './utils.js';
import {
  AuthTokenInvalidError,
  AuthTokenExpiredError,
  AuthTokenNotYetValidError,
  AuthTokenAudienceError,
  AuthTokenIssuerError,
  AuthStorageError,
  AuthError,
} from './errors.js';
import type {
  AuthStorage,
  JWTClaims,
  JWTAlgorithm,
  SignJWTOptions,
  VerifyJWTOptions,
  JWK,
  JWKS,
} from './types.js';

// ─── HS256 implementation (zero-dep) ────────────────────────────────────

/**
 * Computes an HS256 signature. Returns the signature as base64url.
 */
async function hs256Sign(
  signingInput: string,
  secret: Uint8Array,
): Promise<string> {
  const sig = await hmacSha256(secret, signingInput);
  return base64UrlEncode(sig);
}

/**
 * Verifies an HS256 signature in constant time.
 */
async function hs256Verify(
  signingInput: string,
  signature: Uint8Array,
  secret: Uint8Array,
): Promise<boolean> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const computed = new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signingInput) as BufferSource),
  );
  return constantTimeEqual(computed, signature);
}

// ─── RS256 implementation (zero-dep via Web Crypto API) ───────────────

/**
 * Signs data with an RSA private key (RSASSA-PKCS1-v1_5 with SHA-256).
 * Returns the signature as base64url.
 */
async function rs256Sign(
  signingInput: string,
  privateKey: Uint8Array,
): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    privateKey as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    new TextEncoder().encode(signingInput) as BufferSource,
  );
  return base64UrlEncode(new Uint8Array(sig));
}

/**
 * Verifies an RS256 signature using the RSA public key (JWK format).
 * Uses globalThis.crypto.subtle — no deps.
 */
async function rs256Verify(
  signingInput: string,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "spki",
    publicKey as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return globalThis.crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    signature as BufferSource,
    new TextEncoder().encode(signingInput) as BufferSource,
  );
}

/**
 * Verifies an RS256 signature using a JWK-formatted RSA public key.
 * Use this when the key comes from an external JWKS endpoint (Cognito,
 * Auth0, Google) in JWK format rather than raw SPKI bytes.
 */
export async function rs256VerifyJWK(
  signingInput: string,
  signature: Uint8Array,
  jwk: { n: string; e: string },
): Promise<boolean> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return globalThis.crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    signature as BufferSource,
    new TextEncoder().encode(signingInput) as BufferSource,
  );
}

// ─── EdDSA implementation (optional @noble/ed25519) ─────────────────────

/**
 * Lazy import of @noble/ed25519. If not installed, EdDSA is not supported.
 */
// @ts-ignore — optional peer-dep, may not be installed
let ed25519Module: any = null;
async function getEd25519(): Promise<any> {
  if (ed25519Module) return ed25519Module;
  try {
    // Dynamic import to avoid hard dep on @noble/ed25519
    // @ts-ignore — optional peer-dep
    ed25519Module = await import("@noble/ed25519/ed25519");
    return ed25519Module;
  } catch {
    throw new AuthError(
      "AUTH_DEPENDENCY",
      "EdDSA requires @noble/ed25519 to be installed (npm install @noble/ed25519)",
    );
  }
}

// ─── JWT header / payload encoding ──────────────────────────────────────

interface JWTHeader {
  alg: JWTAlgorithm;
  typ: "JWT";
  kid?: string;
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

function base64UrlDecodeString(s: string): string {
  return new TextDecoder().decode(base64UrlDecode(s));
}

function encodeHeader(header: JWTHeader): string {
  return base64UrlEncodeString(JSON.stringify(header));
}

function encodePayload(claims: JWTClaims): string {
  return base64UrlEncodeString(JSON.stringify(claims));
}

function decodeHeader(headerB64: string): JWTHeader {
  try {
    return JSON.parse(base64UrlDecodeString(headerB64)) as JWTHeader;
  } catch {
    throw new AuthTokenInvalidError("JWT header is malformed JSON");
  }
}

function decodePayload(payloadB64: string): JWTClaims {
  try {
    return JSON.parse(base64UrlDecodeString(payloadB64)) as JWTClaims;
  } catch {
    throw new AuthTokenInvalidError("JWT payload is malformed JSON");
  }
}

// ─── signJWT ─────────────────────────────────────────────────────────────

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
export async function signJWT(
  claims: JWTClaims,
  options: SignJWTOptions,
): Promise<{ token: string; keyId: string }> {
  const { storage, alg = "HS256", expiresInSec = 900, notBeforeSec = 0 } = options;

  if (!claims.sub) {
    throw new AuthTokenInvalidError("Missing required claim: sub");
  }

  // Resolve signing key
  let keyId: string;
  let secret: Uint8Array | undefined;

  if (options.keyId && options.secret) {
    keyId = options.keyId;
    secret = options.secret;
  } else if (options.keyId) {
    const stored = await storage.getKeyById(options.keyId);
    if (!stored) {
      throw new AuthTokenInvalidError(`Unknown key ID: ${options.keyId}`);
    }
    keyId = options.keyId;
    secret = stored.secretOrPrivate;
  } else if (options.secret) {
    keyId = "manual";
    secret = options.secret;
  } else {
    keyId = await storage.getActiveKeyId();
    const stored = await storage.getKeyById(keyId);
    if (!stored) {
      throw new AuthTokenInvalidError(`Active key not found: ${keyId}`);
    }
    secret = stored.secretOrPrivate;
  }

  if (!secret) {
    throw new AuthError("AUTH_CONFIG", "Secret is required");
  }

  // Build claims with standard timestamps
  const now = Math.floor(Date.now() / 1000);
  const fullClaims: JWTClaims = {
    ...claims,
    iat: claims.iat ?? now,
    exp: claims.exp ?? now + expiresInSec,
    nbf: claims.nbf ?? now + notBeforeSec,
    jti: claims.jti ?? randomBase64Url(16),
  };

  // Note: we do NOT validate that exp is in the future here. That's verifyJWT's job.
  // signJWT is a pure signing function — it can produce tokens with any claim shape.
  // verifyJWT rejects expired tokens.

  // Encode header and payload
  const header: JWTHeader = { alg, typ: "JWT", kid: keyId };
  const headerB64 = encodeHeader(header);
  const payloadB64 = encodePayload(fullClaims);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign
  let signatureB64: string;
  if (alg === "HS256") {
    signatureB64 = await hs256Sign(signingInput, secret);
  } else if (alg === "EdDSA") {
    const ed = await getEd25519();
    // For EdDSA, we sign with the private key directly.
    signatureB64 = base64UrlEncode(await ed.sign(signingInput, secret));
  } else if (alg === "RS256") {
    // RS256 signs with the private key in PKCS#8 format.
    signatureB64 = await rs256Sign(signingInput, secret);
  } else {
    throw new AuthError("AUTH_CONFIG", `Unsupported algorithm: ${alg}`);
  }

  return { token: `${signingInput}.${signatureB64}`, keyId };
}

// ─── verifyJWT ───────────────────────────────────────────────────────────

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
export async function verifyJWT(
  token: string,
  options: VerifyJWTOptions,
): Promise<JWTClaims> {
  const {
    storage,
    audience,
    issuer,
    algorithms = ["HS256"],
    clockSkewSec = 5,
    rejectExpired = true,
  } = options;

  // SECURITY: never accept `none` or any algorithm not in the allow-list.
  if (algorithms.includes("none" as JWTAlgorithm)) {
    throw new AuthError("AUTH_CONFIG", "Algorithm 'none' is never allowed");
  }
  if (algorithms.length === 0) {
    throw new AuthError("AUTH_CONFIG", "At least one algorithm must be allowed");
  }

  // Split token
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthTokenInvalidError("JWT must have 3 parts");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header
  const header = decodeHeader(headerB64);
  if (!header.alg || !algorithms.includes(header.alg)) {
    throw new AuthTokenInvalidError(
      `JWT alg "${header.alg}" is not in the allow-list: ${algorithms.join(", ")}`,
    );
  }
  if (header.typ && header.typ !== "JWT") {
    throw new AuthTokenInvalidError(`JWT typ must be "JWT", got "${header.typ}"`);
  }
  if (!header.kid) {
    throw new AuthTokenInvalidError("JWT missing required header: kid");
  }

  // Load key by kid, or use provided secret
  let key: { secretOrPrivate: Uint8Array; publicKey?: Uint8Array };
  if (options.secret) {
    key = { secretOrPrivate: options.secret };
  } else {
    try {
      const stored = await storage.getKeyById(header.kid);
      if (!stored) {
        throw new AuthTokenInvalidError(`Unknown key ID: ${header.kid}`);
      }
      key = stored;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthStorageError("Failed to load signing key", err);
    }
  }

  // Verify signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);

  let signatureValid = false;
  if (header.alg === "HS256") {
    signatureValid = await hs256Verify(signingInput, signature, key.secretOrPrivate);
  } else if (header.alg === "EdDSA") {
    const ed = await getEd25519();
    // For EdDSA, we verify with the public key.
    if (!key.publicKey) {
      throw new AuthTokenInvalidError("EdDSA key has no public key");
    }
    signatureValid = ed.verify(signature, signingInput, key.publicKey);
  } else if (header.alg === "RS256") {
    if (!key.publicKey) {
      throw new AuthTokenInvalidError("RS256 key has no public key");
    }
    signatureValid = await rs256Verify(signingInput, signature, key.publicKey);
  } else {
    // Should never reach here (header.alg is in algorithms list)
    throw new AuthTokenInvalidError(`Unsupported algorithm: ${header.alg}`);
  }

  if (!signatureValid) {
    throw new AuthTokenInvalidError("JWT signature is invalid");
  }

  // Decode payload
  const claims = decodePayload(payloadB64);
  const now = Math.floor(Date.now() / 1000);

  // Validate exp
  if (typeof claims.exp === "number") {
    if (rejectExpired && claims.exp + clockSkewSec < now) {
      throw new AuthTokenExpiredError(claims.exp);
    }
  }

  // Validate nbf
  if (typeof claims.nbf === "number") {
    if (claims.nbf - clockSkewSec > now) {
      throw new AuthTokenNotYetValidError(claims.nbf);
    }
  }

  // Validate iss
  if (issuer) {
    if (claims.iss !== issuer) {
      throw new AuthTokenIssuerError(issuer, claims.iss ?? "(none)");
    }
  }

  // Validate aud
  if (audience) {
    const audList = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const required = Array.isArray(audience) ? audience : [audience];
    const hasMatch = required.some((req) => audList.includes(req));
    if (!hasMatch) {
      throw new AuthTokenAudienceError(
        Array.isArray(audience) ? audience.join(",") : audience,
        Array.isArray(claims.aud) ? claims.aud.join(",") : (claims.aud ?? "(none)"),
      );
    }
  }

  return claims;
}

// ─── rotateKeys ──────────────────────────────────────────────────────────

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
export async function rotateKeys(options: {
  storage: AuthStorage;
  alg?: JWTAlgorithm;
}): Promise<{ newKeyId: string; deprecatedKeyId: string | null }> {
  const { storage, alg = "HS256" } = options;

  let oldKeyId: string | null;
  try {
    oldKeyId = await storage.getActiveKeyId();
  } catch {
    // No active key yet (first rotation). This is fine.
    oldKeyId = null;
  }
  const newKeyId = `key-${Date.now()}-${randomBase64Url(4)}`;

  let secretOrPrivate: Uint8Array;
  let publicKey: Uint8Array | undefined;

  if (alg === "HS256") {
    // 32 bytes of crypto-random data
    secretOrPrivate = new Uint8Array(32);
    globalThis.crypto.getRandomValues(secretOrPrivate);
  } else if (alg === "EdDSA") {
    const ed = await getEd25519();
    // For EdDSA, generate a 32-byte private key (Ed25519 seed).
    const privateKey = ed.utils.randomPrivateKey();
    const derivedPublicKey = await ed.getPublicKeyAsync(privateKey);
    secretOrPrivate = privateKey;
    publicKey = derivedPublicKey;
  } else if (alg === "RS256") {
    // Generate a 2048-bit RSA keypair
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    // Export private key as PKCS#8 DER bytes
    secretOrPrivate = new Uint8Array(
      await globalThis.crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    );
    // Export public key as SPKI DER bytes
    publicKey = new Uint8Array(
      await globalThis.crypto.subtle.exportKey("spki", keyPair.publicKey),
    );
  } else {
    throw new AuthError("AUTH_CONFIG", `Unsupported algorithm: ${alg}`);
  }

  await storage.rotateKey(newKeyId, secretOrPrivate, publicKey);
  return { newKeyId, deprecatedKeyId: oldKeyId };
}

// ─── jwksPublish ─────────────────────────────────────────────────────────

/**
 * Returns the JWKS (JSON Web Key Set) for public verification.
 *
 * Filters by algorithm (default: only the requested alg). For HS256, the
 * public JWKS does NOT include the symmetric secret (would be a security
 * disaster). Only EdDSA keys are exposed publicly.
 *
 * @returns JWKS document.
 */
export async function jwksPublish(options: {
  storage: AuthStorage;
  alg?: JWTAlgorithm;
}): Promise<JWKS> {
  const { storage, alg = "EdDSA" } = options;

  if (alg === "HS256") {
    // HS256 keys are symmetric and MUST NOT be exposed.
    return { keys: [] };
  }

  const keyIds = await storage.listKeyIds();
  const keys: JWK[] = [];

  for (const kid of keyIds) {
    const stored = await storage.getKeyById(kid);
    if (!stored || !stored.publicKey) continue;

    if (alg === "EdDSA") {
      keys.push({
        kty: "OKP",
        kid,
        alg: "EdDSA",
        use: "sig",
        crv: "Ed25519",
        x: base64UrlEncode(stored.publicKey),
      });
    } else if (alg === "RS256") {
      // For RSA keys, we need to import the SPKI public key, then
      // export to JWK format to extract n and e.
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        "spki",
        stored.publicKey as BufferSource,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        true,
        ["verify"],
      );
      const jwk = await globalThis.crypto.subtle.exportKey("jwk", cryptoKey);
      keys.push({
        kty: "RSA",
        kid,
        alg: "RS256",
        use: "sig",
        n: jwk.n,
        e: jwk.e,
      });
    }
  }

  return { keys };
}

// ─── Internal: timestamp helpers ────────────────────────────────────────

/**
 * Returns the current Unix timestamp in seconds.
 */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Computes a future Unix timestamp.
 */
export function futureSec(seconds: number): number {
  return nowSec() + seconds;
}

// ─── Debug helper ────────────────────────────────────────────────────────

/**
 * Decodes a JWT without verifying the signature. Useful for debugging.
 * NEVER use this in security-sensitive code paths.
 */
export function decodeJWTUnsafe(token: string): { header: JWTHeader; claims: JWTClaims } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthTokenInvalidError("JWT must have 3 parts");
  return {
    header: decodeHeader(parts[0]),
    claims: decodePayload(parts[1]),
  };
}
