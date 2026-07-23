# OCAIS v3.0 — Auth Expansion Proposal

**Date**: 2026-07-09
**Status**: Draft
**Author**: dark-router (operator-approved)
**SemVer**: Major (3.0.0) — adds new capability surface, no breaking changes to v2.x API

## Why

OCAIS v2.0.0 (released 2026-06-20) is a successful AI streaming SDK with 15KB bundle, zero runtime deps, and 17 unit tests. Operator decision 2026-07-09 (per `obs-f13aa709465a`): **expand OCAIS to include auth primitives**, applying the same architectural philosophy (zero-deps, serverless-first, MIT, public).

### Trigger events

1. **Cognito problems**. Operator documented (per `obs-a0e9926ed982`) that they had previously left Cognito for "the same" reasons — vendor lock-in, complex configuration, debugging hell. The 2026-07-09 survey (this morning) confirmed Cognito is still problematic.

2. **BUG-17 PROD anomaly**. API Gateway HTTP API v2 REQUEST Authorizer has anomalous caching behavior in PROD. After 2+ hours of debugging (12+ deploys, multiple authorizer recreations, lambda permission changes, format 1.0 vs 2.0 with `EnableSimpleResponses`), the Authorizer returns 401 with `authorizerStatus: 401` without invoking the Lambda. Dev environment works (7/7 E2E tests pass), but PROD is broken. This is a bug in AWS infra, not in our code.

3. **Auth library survey 2026-07-09** (per `obs-a0e9926ed982`). Operator compared 7 OSS libraries (Better-Auth, Auth.js, Clerk, Logto, Lucia, Supabase, WorkOS). Verdict: Better-Auth is the winner for future migration, but the operator decided to **expand OCAIS instead** (so the same team owns the auth library, same architecture, same release process).

4. **Existing patchwork**. Currently, auth is scattered across `opita-account-ui` (`backend/auth/core.ts`, magic-link handlers, HMAC cookie signing, Cognito Pre-Auth Lambda), `opita-trabajos` (Lambda Authorizer, opita_sso cookie validation), and a hotfix list documented in `obs-5626` (unsigned cookie) and `obs-5632` (cookie fallback).

## What

### v3.0.0 adds a new `auth` capability to OCAIS

**Public API surface** (all in `@opitacode/ocais/auth`):

```typescript
import {
  // Magic-link
  magicLinkRequest, magicLinkVerify,
  // JWT
  signJWT, verifyJWT, jwksPublish, rotateKeys,
  // Password
  passwordHash, passwordVerify,
  // Sealed cookies
  cookieSign, cookieVerify,
  // Rate limit
  rateLimit, createRateLimiter,
  // Errors
  AuthError, AuthRateLimitError, AuthTokenExpiredError, AuthTokenInvalidError,
  // Types
  type MagicLinkRequest, type JWTClaims, type PasswordHash, type CookieValue,
  // Storage adapter
  type AuthStorage,
} from "@opitacode/ocais/auth";
```

### Principles (same as v2.0)

1. **Zero runtime deps** (peer-deps for argon2id optional)
2. **TypeScript-first** with full type safety
3. **Serverless-first** — works in AWS Lambda, Cloudflare Workers, Vercel Edge
4. **Provider-agnostic** — user supplies their own storage (DDB, Redis, KV)
5. **Audit-friendly** — every primitive emits structured logs with requestId, source, latencyMs
6. **Fail-closed** — timeout, error, or invalid token → Deny (never Allow an unverified user)

### v3.0 does NOT change

- v2.0 AI streaming API (`streamText`, `generateObject`, `createSSEWriter`)
- Existing v2.x exports
- Existing tests

## How

### Phased delivery (4 phases, ~2-3 sprints)

**Phase 0 — Research (1-2 days, this sprint)**
- OSINT: CVEs Cognito 2024-2026, post-mortems (Tailscale, Auth0, Clerk)
- OWASP ASVS Level 2/3 controls for auth-as-a-service
- Survey primitives: noble/ed25519 vs jose, @node-rs/argon2 vs bcrypt, sealed-cookies libs
- Threat model: STRIDE for each primitive
- Decision doc: build vs adopt, what to ship in v3.0 MVP

**Phase 1 — MVP primitives (1 sprint)**
- `magicLink.ts` — magicLinkRequest, magicLinkVerify (single-use, 32-byte token, atomic delete, 10-min TTL)
- `jwt.ts` — signJWT, verifyJWT (HS256 default, EdDSA optional)
- `cookie.ts` — cookieSign, cookieVerify (HMAC + AES-256-GCM, 32-byte secret)
- `errors.ts` — typed error hierarchy
- 80+ unit tests
- Docs: usage, security model, threat model

**Phase 2 — Migration (1 sprint)**
- `opita-account-ui` migrates from Cognito to OCAIS-auth
- `opita-trabajos` API Gateway Authorizer removed (validation moves to each Lambda)
- Camila magic-link flow uses OCAIS primitives
- Cognito User Pool left as read-only fallback (deprecated)

**Phase 3 — Hardening + public release (1 sprint)**
- Pen test (dark-pentester agents)
- OSINT re-validation
- `research/security-audit-2026-q3.md` (CVE-style review)
- Public docs site (GitHub Pages or similar)
- Blog post: "Why we replaced Cognito with 200 lines of Lambda"
- Submit to HN, /r/selfhosted, awesome-selfhosted

### Storage adapter pattern

All primitives are pure functions that delegate storage to a user-supplied adapter:

```typescript
interface AuthStorage {
  // Magic-link
  putMagicLink(token: string, payload: MagicLinkPayload, ttlMs: number): Promise<void>;
  getMagicLink(token: string): Promise<{ payload: MagicLinkPayload } | null>;
  deleteMagicLink(token: string): Promise<void>;

  // JWT keys
  getActiveKeyId(): Promise<string>;
  getKeyById(keyId: string): Promise<{ secretOrPrivate: Buffer; publicKey?: Buffer } | null>;
  rotateKey(newKeyId: string, newKey: Buffer): Promise<void>;
  listKeyIds(): Promise<string[]>;

  // Rate limit
  incrCounter(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}
```

DDB adapter ships in `opita-account-ui` (consumer). Users can write their own (Redis, etc.).

### Migration path (Phase 2)

**Camila walkthrough** (current state, this sprint):
- Camila logs in via magic-link → receives opita_sso cookie (HMAC-signed)
- Form fill OK (BUG-15+16 fixed in commit `a48c2b5`)
- POST /trabajos/profile returns 401 (BUG-17 PROD anomaly, AWS infra bug)

**After OCAIS v3.0 MVP** (Phase 2):
- Camila logs in via OCAIS magicLinkRequest → receives OCAIS JWT
- Frontend stores JWT in localStorage (HttpOnly cookie not required for first-party apps)
- Frontend sends `Authorization: Bearer <jwt>` to opita-trabajos API
- Each Lambda in opita-trabajos validates the JWT via OCAIS verifyJWT
- API Gateway Authorizer removed (or replaced with a simple proxy that forwards Authorization header to integration)

## Success criteria

**Phase 0 (now)**:
- [ ] `openspec/changes/2026-07-09-v3-auth-expansion/research/osint-2026-07-09.md` exists with CVE survey
- [ ] `design.md` has threat model (STRIDE) and primitives decision
- [ ] Decision is operator-validated

**Phase 1**:
- [ ] 80+ unit tests, all passing
- [ ] Bundle size < 30KB (v2.0 is 15KB, +5-10KB for auth is the budget)
- [ ] No new runtime deps
- [ ] Docs in `docs/auth/` with threat model + usage

**Phase 2**:
- [ ] opita-account-ui migrated (Cognito not used at runtime)
- [ ] Camila magic-link flow works in PROD end-to-end (login + form + save)
- [ ] opita-trabajos API Authorizer removed

**Phase 3**:
- [ ] Pen test report (dark-pentester agents)
- [ ] Public release on npm + docs site
- [ ] Blog post + community submission

## Files

- `openspec/changes/2026-07-09-v3-auth-expansion/` (this change)
- `src/auth/` (new directory, Phase 1)
- `tests/auth/` (new directory, Phase 1)
- `docs/auth/` (new directory, Phase 1)
- `CHANGELOG.md` (Phase 1 — v3.0.0 entry)
- `package.json` (Phase 1 — add `exports["./auth"]`)

## Out of scope (deferred)

- **OAuth/OIDC provider**: OCAIS v3.0 is a primitive library, not an OIDC IdP. If someone needs OIDC, they can build on top.
- **WebAuthn / passkeys**: deferred to v3.1
- **Multi-tenancy**: not in MVP. Each consumer manages their own user space.
- **Email/SMS sending**: OCAIS doesn't send. User supplies the transport.
- **Session storage server**: OCAIS doesn't ship a DDB adapter. User implements one or uses the reference.
- **Frontend components**: OCAIS is server-side primitives. UI is up to the consumer.

## Related

- `obs-f13aa709465a` (router/ocais-v3-auth-expansion-decided-2026-07-09) — decision observation
- `obs-a0e9926ed982` (architecture/auth-library-decision-2026-07) — auth library survey
- `obs-5626` (security/opita-sso-cookie-unsigned) — magic-link.ts:277 unsigned cookie (already patched)
- `obs-5627` (opita-account-ui/auth/cognito-magic-link-migration) — Cognito native magic-link research
- `obs-5629` (opita-account-ui/auth/cognito-magic-link-migration) — Cognito CUSTOM_CHALLENGE slots
- `obs-5632` (opita-account-ui/auth/middleware-cookie-support) — /v1/me cookie support
- `openspec/changes/2026-07-09-v3-auth-expansion/CLOSED.md` — postmortem (created when sprint closes)

## Reviewers

- Operator (final approval)
- dark-router (consistency with prior decisions)
- OSINT: dark-osint-web, dark-tools-osint
- Security: dark-pentester-* (Phase 3)
