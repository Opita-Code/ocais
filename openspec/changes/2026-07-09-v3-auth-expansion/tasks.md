# OCAIS v3.0 Auth Expansion — Tasks

**Status**: Draft (Phase 0 active)
**Phases**: 0 (Research) → 1 (MVP primitives) → 2 (Migration) → 3 (Hardening + Public Release)

## Phase 0 — Research (this sprint) — IN PROGRESS

- [x] Create `openspec/changes/2026-07-09-v3-auth-expansion/` structure
- [x] Write `proposal.md` with motivation, scope, MVP definition
- [ ] Write `research/osint-2026-07-09.md` — CVE survey (Cognito 2024-2026) + OWASP ASVS L2/L3 controls
- [ ] Write `research/primitives-options.md` — own (noble/ed25519, @node-rs/argon2) vs library (jose, bcrypt, etc.)
- [ ] Write `research/threat-model-stride.md` — STRIDE for each primitive
- [ ] Write `design.md` — primitives decision + storage adapter + API surface
- [ ] Operator validates the decision
- [ ] Persist Phase 0 observations to dark-mem

## Phase 1 — MVP primitives (next sprint)

### Magic-link primitive (`src/auth/magic-link.ts`)
- [ ] `magicLinkRequest(email, opts, storage)` — generates 32-byte base64url token, stores payload, returns `{ token, expiresAt }`
- [ ] `magicLinkVerify(token, opts, storage)` — atomic single-use delete, returns payload or null
- [ ] Default TTL: 10 min (configurable)
- [ ] Default: 60s rate limit per email (configurable)
- [ ] Tests: 30+ unit tests (storage mock, expiry, atomic delete, rate limit, malformed token, replay attack)

### JWT primitive (`src/auth/jwt.ts`)
- [ ] `signJWT(claims, opts)` — HS256 default, EdDSA optional
- [ ] `verifyJWT(token, opts)` — validates signature, exp, nbf, iss, aud
- [ ] `rotateKeys(storage)` — generates new key, marks old as deprecated (24h grace)
- [ ] `jwksPublish(storage)` — returns JWKS for public verification
- [ ] Tests: 25+ unit tests (exp, nbf, iss, aud, alg confusion, key rotation, signature tampering)

### Cookie primitive (`src/auth/cookie.ts`)
- [ ] `cookieSign(value, secret)` — HMAC-SHA256 + AES-256-GCM (sealed cookies)
- [ ] `cookieVerify(cookie, secret)` — constant-time compare
- [ ] Default: 7-day expiry, `Secure; HttpOnly; SameSite=Lax`
- [ ] Tests: 20+ unit tests (tampering, replay, expiry, constant-time)

### Errors (`src/auth/errors.ts`)
- [ ] `AuthError` (base), `AuthRateLimitError`, `AuthTokenExpiredError`, `AuthTokenInvalidError`, `AuthStorageError`
- [ ] All extend `AuthError` for `instanceof` checks
- [ ] Tests: 5+ unit tests

### Re-exports
- [ ] `src/auth/index.ts` — re-export public API
- [ ] `src/index.ts` — add `export * from "./auth/index.js"`
- [ ] `package.json` — add `exports["./auth"]`

### Docs
- [ ] `docs/auth/threat-model.md` — STRIDE for each primitive
- [ ] `docs/auth/usage.md` — examples (magic-link, JWT, cookie)
- [ ] `docs/auth/security.md` — security properties, threat model, compliance
- [ ] `CHANGELOG.md` — v3.0.0 entry (Added: auth primitives)

### Quality gates
- [ ] 80+ new unit tests, all passing
- [ ] Bundle size: v2.0 (15KB) + auth (≤15KB) = ≤30KB
- [ ] No new runtime deps (argon2id as optional peer-dep if needed)
- [ ] `npm run typecheck` clean
- [ ] `npm test` clean

## Phase 2 — Migration (sprint +1)

### opita-account-ui migration
- [ ] Add `@opitacode/ocais` (>=3.0.0) to dependencies
- [ ] Implement `DDBAuthStorage` adapter
- [ ] Replace `backend/auth/core.ts` magic-link handler with OCAIS primitives
- [ ] Replace `backend/auth/middleware/cookie-support.ts` with OCAIS cookie primitive
- [ ] Remove Cognito from runtime (keep User Pool for read-only migration grace period)
- [ ] Run all 716+ existing tests, fix any breakage
- [ ] Camila magic-link E2E test (login → form fill → save → reload → persisted)

### opita-trabajos migration
- [ ] Remove Lambda Authorizer from API Gateway routes
- [ ] Add `@opitacode/ocais` (>=3.0.0) to TrabajosApiFunction
- [ ] Add `verifyJWT(authorizationHeader)` to each protected route's handler
- [ ] Frontend: change `lib/api.ts` to send `Authorization: Bearer <jwt>` instead of relying on opita_sso cookie
- [ ] Deploy to DEV, run all 7 BUG-17 E2E tests (should pass)
- [ ] Deploy to PROD, run Camila walkthrough (should work)

### Verification
- [ ] Camila walks full flow: magic-link → dashboard → form fill → save → reload → persisted
- [ ] No 401 on POST /trabajos/profile
- [ ] All 7 BUG-17 tests pass
- [ ] opita-trabajos frontend bundle includes OCAIS

## Phase 3 — Hardening + Public Release (sprint +2)

### Pen test (dark-pentester agents)
- [ ] Magic-link: replay attack, atomic-delete race, timing attack
- [ ] JWT: alg confusion (HS256 vs none), key rotation race, jwks exposure
- [ ] Cookie: tampering, replay across rotations, constant-time verification
- [ ] Rate limit: bypass via key rotation, distributed DoS
- [ ] Storage: SSRF, DDB injection

### OSINT re-validation
- [ ] CVE review of @noble/ed25519, @noble/hashes, @node-rs/argon2
- [ ] OWASP ASVS L3 control coverage
- [ ] `research/security-audit-2026-q3.md` — pen test report

### Public release
- [ ] v3.0.0 published to npm
- [ ] GitHub release with notes
- [ ] Docs site (GitHub Pages from `docs/`)
- [ ] Blog post: "Why we replaced Cognito with 200 lines of Lambda"
- [ ] Submit to:
  - [ ] Hacker News (Show HN)
  - [ ] /r/selfhosted
  - [ ] /r/typescript
  - [ ] awesome-selfhosted (PR)
  - [ ] awesome-auth (PR)

### Community
- [ ] `CONTRIBUTING.md` updated with auth-specific guide
- [ ] `SECURITY.md` with disclosure policy
- [ ] Discord / GitHub Discussions enabled
- [ ] Discord channel #ocais-auth

## Backlog (deferred to v3.1+)

- [ ] WebAuthn / passkeys primitive
- [ ] OAuth/OIDC provider (build on top of OCAIS primitives)
- [ ] Multi-tenancy adapter pattern
- [ ] Server-side session storage (DDB-backed sessions)
- [ ] Hardware key support (FIDO2)
- [ ] Adaptive auth (risk-based step-up)
- [ ] Anomaly detection (signin velocity, geo-fencing)

## Critical path

```
Phase 0 (1-2 days) → Phase 1 (1 sprint) → Phase 2 (1 sprint) → Phase 3 (1 sprint)
                      ↓
                    Camila unblocked (Phase 2)
```

## Dependencies on other work

- None for Phase 0 (pure research)
- Phase 1 depends on Phase 0 operator validation
- Phase 2 depends on Phase 1 npm publish (`@opitacode/ocais@3.0.0`)
- Phase 3 depends on Phase 2 PROD validation (Camila working in PROD)
