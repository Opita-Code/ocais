/**
 * OCAIS Auth — public API
 *
 * Import from `@opita/ocais/auth`:
 *
 *   import {
 *     magicLinkRequest, magicLinkVerify,
 *     signJWT, verifyJWT, rotateKeys, jwksPublish,
 *     cookieSign, cookieVerify,
 *     passwordHash, passwordVerify,
 *     rateLimit, createRateLimiter,
 *   } from "@opita/ocais/auth";
 *
 *   import type {
 *     AuthStorage, JWTClaims, MagicLinkPayload, CookieAttributes,
 *     RateLimitOptions, Argon2idParams, JWTAlgorithm, JWKS, JWK,
 *   } from "@opita/ocais/auth";
 */

// Errors
export {
  AuthError,
  AuthMagicLinkInvalidError,
  AuthTokenInvalidError,
  AuthTokenExpiredError,
  AuthTokenNotYetValidError,
  AuthTokenAudienceError,
  AuthTokenIssuerError,
  AuthCookieInvalidError,
  AuthPasswordInvalidError,
  AuthRateLimitError,
  AuthStorageError,
  AuthKeyError,
  isAuthError,
} from './errors.js';

// Types
export type {
  AuthStorage,
  MagicLinkPayload,
  MagicLinkRequestOptions,
  MagicLinkVerifyOptions,
  JWTClaims,
  JWTAlgorithm,
  SignJWTOptions,
  VerifyJWTOptions,
  JWK,
  JWKS,
  CookieAttributes,
  CookieOptions,
  Argon2idParams,
  PasswordOptions,
  RateLimitOptions,
  RateLimitResult,
  Result,
} from './types.js';

export { DEFAULT_ARGON2ID_PARAMS } from './types.js';

// Magic-link
export { magicLinkRequest, magicLinkVerify } from './magic-link.js';

// JWT
export {
  signJWT,
  verifyJWT,
  rotateKeys,
  jwksPublish,
  nowSec,
  futureSec,
  decodeJWTUnsafe,
} from './jwt.js';

// Cookie
export {
  cookieSign,
  cookieVerify,
  buildDeleteCookieHeader,
  inspectCookie,
} from './cookie.js';

// Password
export {
  passwordHash,
  passwordVerify,
  paramsFromHash,
  needsRehash,
} from './password.js';

// Rate limit
export {
  rateLimit,
  createRateLimiter,
  hashRateLimitKey,
  _resetRateLimitStoreForTesting,
  _rateLimitStoreSize,
} from './rate-limit.js';

// Utils (exposed for advanced consumers / test helpers)
export {
  randomBytes,
  randomBase64Url,
  base64UrlEncode,
  base64UrlDecode,
  constantTimeEqual,
  constantTimeEqualString,
  constantTimeEqualHex,
  hmacSha256,
  hmacSha256Verify,
  bytesToHex,
  hexToBytes,
  safeEqual,
} from './utils.js';
