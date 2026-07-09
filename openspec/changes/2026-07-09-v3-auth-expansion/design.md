# OCAIS v3.0 Auth Expansion — Design

**Date**: 2026-07-09
**Status**: Draft (Phase 0)
**Companion**: `proposal.md`, `research/osint-2026-07-09.md`, `research/threat-model-stride.md`, `tasks.md`

## Goal

Add a small, auditable, serverless-first `auth` capability to OCAIS that lets consumers ship passwordless login (magic-link + JWT + sealed cookies) in 1-2 sprints, replacing Cognito in our own stack and providing a public alternative for other teams.

## Design principles (from v2.0, restated)

1. **Zero runtime deps** (peer-deps for argon2id and noble/ed25519 are optional and explicit)
2. **TypeScript-first** with strict mode, full type safety
3. **Serverless-first** — works in AWS Lambda, Cloudflare Workers, Vercel Edge
4. **Provider-agnostic** — consumer supplies storage (DDB, Redis, etc.) via `AuthStorage` interface
5. **Audit-friendly** — structured logs: `requestId, source, allow, latencyMs, error`
6. **Fail-closed** — timeout, error, invalid token → Deny (never Allow an unverified user)

## Module structure

```
src/auth/
  index.ts          — public re-exports
  magic-link.ts     — magicLinkRequest, magicLinkVerify
  jwt.ts            — signJWT, verifyJWT, jwksPublish, rotateKeys
  cookie.ts         — cookieSign, cookieVerify
  password.ts       — passwordHash, passwordVerify
  rate-limit.ts     — rateLimit, createRateLimiter
  errors.ts         — AuthError hierarchy
  types.ts          — shared types (AuthStorage, MagicLinkPayload, JWTClaims, etc.)
  utils.ts          — constant-time compare, hmacSha256, randomBytes
```

## Public API

### magic-link.ts

```typescript
import { magicLinkRequest, magicLinkVerify } from "@opita/ocais/auth";
import type { AuthStorage, MagicLinkPayload } from "@opita/ocais/auth";

const storage: AuthStorage = /* user implements */;

const { token, expiresAt } = await magicLinkRequest(
  { email: "user@example.com", redirectTo: "https://app.example.com/welcome" },
  {
    storage,
    ttlMs: 600_000,         // 10 min
    rateLimitMs: 60_000,    // 1 per email per 60s
    secret: process.env.MAGIC_LINK_SECRET!,
  },
);
// → consumer sends email with link: https://app.example.com/welcome?token=<token>

const payload = await magicLinkVerify(
  { token: req.query.token },
  { storage, secret: process.env.MAGIC_LINK_SECRET! },
);
// → returns { email, redirectTo, ... } or null
```

### jwt.ts

```typescript
import { signJWT, verifyJWT, jwksPublish, rotateKeys } from "@opita/ocais/auth";
import type { AuthStorage, JWTClaims } from "@opita/ocais/auth";

const storage: AuthStorage = /* user implements */;

const { token } = await signJWT(
  { sub: "user-123", iss: "https://app.example.com", aud: "api.example.com" },
  {
    storage,
    secret: process.env.JWT_SECRET!,  // 32+ bytes
    expiresInSec: 900,                // 15 min
    alg: "HS256",
  },
);

const claims = await verifyJWT(token, {
  storage,
  secret: process.env.JWT_SECRET!,
  audience: "api.example.com",
  issuer: "https://app.example.com",
  clockSkewSec: 5,
});
// → returns { sub, exp, iat, nbf, iss, aud, ... } or throws AuthTokenExpiredError / AuthTokenInvalidError

// Key rotation:
await rotateKeys({ storage, secret: process.env.JWT_SECRET! });
// → generates new key, marks old as deprecated (24h grace)

// Public JWKS endpoint:
const jwks = await jwksPublish({ storage, alg: "EdDSA" });
// → returns { keys: [{ kty, kid, alg, use, ... }] }
```

### cookie.ts

```typescript
import { cookieSign, cookieVerify } from "@opita/ocais/auth";

const cookie = await cookieSign(
  { sub: "user-123", role: "user" },
  {
    secret: process.env.COOKIE_SECRET!,  // 32+ bytes
    expiresInSec: 604_800,                // 7 days
    attributes: { domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "lax" },
  },
);
// → Set-Cookie: ocais=<cookie>; Domain=.example.com; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800

const value = await cookieVerify(cookie, { secret: process.env.COOKIE_SECRET! });
// → returns { sub, role, ... } or throws AuthTokenInvalidError
```

### password.ts

```typescript
import { passwordHash, passwordVerify } from "@opita/ocais/auth";

const hash = await passwordHash("hunter2");
// → $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>

const isValid = await passwordVerify(hash, "hunter2");
// → true (constant-time)
// → false if wrong
```

### rate-limit.ts

```typescript
import { rateLimit, createRateLimiter } from "@opita/ocais/auth";

const result = await rateLimit({
  key: `magic-link:${emailHash}`,
  max: 5,
  windowMs: 3600_000,  // 1 hour
  storage,             // in-memory if not provided
});
// → { allowed: boolean, remaining: number, resetAt: number }

const limiter = createRateLimiter({ max: 100, windowMs: 60_000 });
// → reusable function
```

### errors.ts

```typescript
import { AuthError, AuthTokenExpiredError, AuthTokenInvalidError, AuthRateLimitError, AuthStorageError } from "@opita/ocais/auth";

if (err instanceof AuthTokenExpiredError) {
  // token's exp is in the past
}
if (err instanceof AuthTokenInvalidError) {
  // signature mismatch, bad alg, missing claim, etc.
}
if (err instanceof AuthRateLimitError) {
  // rate limit exceeded
}
// all extend AuthError for `instanceof` checks
```

## Storage adapter (consumer-implemented)

```typescript
import type { AuthStorage } from "@opita/ocais/auth";

// DDB adapter example
export const storage: AuthStorage = {
  // Magic-link
  async putMagicLink(token, payload, ttlMs) {
    await ddb.send(new PutCommand({
      TableName: "auth",
      Item: { tokenKey: `ML#${token}`, ...payload, expiresAt: Date.now() + ttlMs },
      ConditionExpression: "attribute_not_exists(tokenKey)",
    }));
  },
  async getMagicLink(token) {
    const { Item } = await ddb.send(new GetCommand({ TableName: "auth", Key: { tokenKey: `ML#${token}` } }));
    if (!Item || Item.expiresAt < Date.now()) return null;
    return { payload: { email: Item.email, redirectTo: Item.redirectTo } };
  },
  async deleteMagicLink(token) {
    await ddb.send(new DeleteCommand({ TableName: "auth", Key: { tokenKey: `ML#${token}` } }));
  },

  // JWT keys
  async getActiveKeyId() { /* ... */ },
  async getKeyById(keyId) { /* ... */ },
  async rotateKey(newKeyId, newKey) { /* ... */ },
  async listKeyIds() { /* ... */ },

  // Rate limit
  async incrCounter(key, windowMs) {
    // DDB atomic counter with TTL
  },
};
```

OCAIS does NOT ship a DDB adapter in v3.0 MVP. Consumers write their own. (Future: `@opita/ocais/storage-ddb` peer package.)

## API surface (exports in package.json)

```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./auth": { "import": "./dist/auth/index.js", "types": "./dist/auth/index.d.ts" }
  }
}
```

## Backwards compatibility

- v2.0 AI streaming API: unchanged
- v2.0 exports: unchanged
- v2.0 tests: unchanged
- v3.0 ADD: `./auth` subpath
- v2.x consumers: no breaking change. Bump to v3.0 is purely additive.

## Versioning

- **v3.0.0** — adds `auth` subpath
- **v3.1.0** (future) — adds WebAuthn/passkeys, JWE encrypted cookies
- **v4.0.0** (future) — OIDC provider on top of primitives (BREAKING: removes deprecated functions)

## Build

- `tsc` with same config as v2.0
- Bundle: target ES2022, NodeNext modules
- `dist/auth/` (new), `dist/index.js` (existing)
- Bundle size budget: v2.0 (15KB) + auth (≤15KB) = ≤30KB

## Testing

- `node --test --experimental-strip-types tests/auth/*.test.ts`
- Coverage: 80%+ for all primitives
- 100% coverage for: alg confusion rejection, constant-time compare, atomic delete race
- Reference: `research/security-audit-2026-q3.md` (Phase 3)

## Documentation

- `docs/auth/threat-model.md` (copy of `research/threat-model-stride.md` for public)
- `docs/auth/usage.md` — examples
- `docs/auth/security.md` — security properties, compliance (OWASP ASVS L2/L3)
- `CHANGELOG.md` — v3.0.0 entry

## Migration path (Phase 2)

**For opita-account-ui (Cognito consumer)**:
1. `npm install @opita/ocais@^3.0.0`
2. Implement DDB adapter (`storage.ts`)
3. Replace `backend/auth/core.ts:requestMagicLink` with `magicLinkRequest`
4. Replace `backend/auth/core.ts:verifyAuthChallenge` with `magicLinkVerify` + `signJWT`
5. Replace `backend/auth/middleware/cookie-support.ts` with `cookieSign` + `cookieVerify`
6. Keep Cognito User Pool for read-only migration grace (90 days)
7. Run all 716+ existing tests, fix any breakage
8. Camila magic-link E2E test passes

**For opita-trabajos (API Gateway Authorizer consumer)**:
1. `npm install @opita/ocais@^3.0.0`
2. Remove Lambda Authorizer from API Gateway routes
3. Add `verifyJWT(authorizationHeader)` to each protected route's Lambda handler
4. Frontend: change `lib/api.ts` to send `Authorization: Bearer <jwt>` instead of relying on opita_sso cookie
5. Run 7 BUG-17 E2E tests, all pass
6. Deploy to PROD, Camila walkthrough works

## Out of scope (deferred to v3.1+)

- WebAuthn / passkeys
- OAuth/OIDC provider
- Multi-tenancy adapter pattern
- Server-side session storage
- Hardware key support (FIDO2)
- Adaptive auth (risk-based step-up)
- Anomaly detection (signin velocity, geo-fencing)
- Email/SMS sending (consumer's responsibility)
- Frontend components (OCAIS is server-side only)
- DDB adapter (peer package `@opita/ocais/storage-ddb`)
