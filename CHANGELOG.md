# Changelog

All notable changes to OCAIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-07-09

### Added

- **Auth capability** via new `@opita/ocais/auth` subpath. Five primitives, storage-agnostic, zero runtime deps, MIT.
  - **`magicLinkRequest` / `magicLinkVerify`**: single-use, atomic-delete, 32-byte tokens, per-email rate limit. OWASP ASVS V2.5/V2.7 covered.
  - **`signJWT` / `verifyJWT`**: HS256 (zero-dep) and EdDSA (optional `@noble/ed25519` peer-dep). RFC 7519/7515. Strict alg allow-list (rejects `none`). `exp`/`nbf`/`iss`/`aud` validation. JWKS publish.
  - **`rotateKeys`**: key rotation with 24h grace period for in-flight tokens.
  - **`cookieSign` / `cookieVerify`**: HMAC-SHA256 + AES-256-GCM sealed cookies. Tamper-evident + encrypted. Default `HttpOnly; Secure; SameSite=Lax`.
  - **`passwordHash` / `passwordVerify`**: Argon2id via `@node-rs/argon2` optional peer-dep. OWASP-recommended params (19MB / 2 iter / 1 parallel).
  - **`rateLimit` / `createRateLimiter`**: fixed-window rate limiter, in-memory or via storage adapter.
  - **`AuthStorage` interface**: consumer implements DDB/Redis/etc. adapters. OCAIS doesn't ship one.
  - **Typed error hierarchy**: `AuthError` (base), `AuthTokenExpiredError`, `AuthTokenInvalidError`, `AuthMagicLinkInvalidError`, `AuthRateLimitError`, `AuthCookieInvalidError`, `AuthPasswordInvalidError`, `AuthStorageError`, `AuthKeyError`, etc.
- **Optional peer-dependencies**: `@noble/ed25519` (for EdDSA), `@node-rs/argon2` (for password hashing). Both marked `optional` — HS256 and rate-limit work without them.
- **OpenSpec change directory**: `openspec/changes/2026-07-09-v3-auth-expansion/` with proposal, design, threat model, and OSINT research.

### Changed

- **Package description**: "OCAIS — Opita Code AI Stream + Auth primitives" (was: just AI Stream).
- **`src/index.ts`**: re-exports `auth` namespace (consumer convenience). Existing v2.x API unchanged.

### Security

- All primitives fail-closed: timeout, error, or invalid input → Deny (never Allow an unverified user).
- All HMAC compares use constant-time comparison.
- Magic-link HMAC of email (prevents enumeration if storage leaks).
- AES-256-GCM auth tag verified on every cookie decode.
- Argon2id OWASP-recommended params (memory=19MB, iterations=2, parallelism=1).
- JWT alg allow-list explicitly rejects `none` (CVE-2015-9235) and any non-listed alg (CVE-2016-10555 key confusion).

### Not changed

- v2.0 AI streaming API (`streamText`, `generateObject`, `createSSEWriter`, providers, error hierarchy, observability hooks): unchanged.
- v2.x tests: still passing.
- v2.x peer-dependencies (`zod`): unchanged.

### Migration

Existing v2.x consumers: no breaking changes. To adopt auth:

```bash
npm install @opita/ocais@^3.0.0
```

```typescript
import { magicLinkRequest, signJWT, verifyJWT } from "@opita/ocais/auth";
```

## [2.0.0] - 2026-06-20

### Added

- **AbortSignal support** in `streamText` and `generateObject`. Pass `signal: controller.signal` to cancel an in-flight operation. Throws `OCAISAbortError`.
- **Timeout support** in `streamText` and `generateObject`. Pass `timeoutMs: 5000` to throw `OCAISTimeoutError` after N milliseconds.
- **Typed error hierarchy**: `OCAISError` (base), `OCAISAbortError`, `OCAISTimeoutError`, `OCAISParseError`, `OCAISToolError`, `OCAISProviderError`. All extend `OCAISError` for `instanceof` checks.
- **Observability hooks**: `onStart`, `onComplete`, `onError`, `onAbort` in both `streamText` and `generateObject`. Each receives a typed context (`StartContext`, `CompleteContext`, `ErrorContext`).
- **`Usage` type** extracted from inline shape. Now a public type with `promptTokens`, `completionTokens`, `totalTokens`.
- **17 unit tests** using `node:test` + `node:assert/strict` + fetch mocking. No external API calls. Coverage: errors (5), streamText basic + tools + cancellation + observability (8), generateObject basic + cancellation (4).
- **`AbortSignal` passed to `fetch()`** in `openai-compatible` provider (both `streamChatCompletion` and `chatCompletion`). This means `signal` actually cancels the HTTP request, not just the SDK loop.

### Changed

- **`maxSteps` default raised from 1 to 5** (breaking for callers relying on single-turn).
- **JSDoc improvements** on public types and functions.
- **README** rewritten with dedicated sections for cancellation, observability, error hierarchy, and roadmap.

### Migration

See [docs/migration-v1-to-v2.md](docs/migration-v1-to-v2.md) for upgrade guide.

## [1.0.0] - 2026-01-15

Initial release.

### Added

- `streamText` — streaming text with OpenAI-compatible + Google Gemini providers
- `generateObject` — structured output with Zod validation
- `createSSEWriter` — helper for AWS Lambda `responseStream`
- Tool/function calling with server-side execution
- Multi-step conversations with `maxSteps` (default 1)
- Zero runtime dependencies
- TypeScript-first with full type safety

[Unreleased]: https://github.com/Opita-Code/ocais/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Opita-Code/ocais/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Opita-Code/ocais/releases/tag/v1.0.0
