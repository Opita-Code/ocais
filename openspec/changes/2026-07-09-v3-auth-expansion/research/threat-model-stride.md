# OCAIS v3.0 Auth Expansion — Threat Model (STRIDE)

**Date**: 2026-07-09
**Status**: Draft (Phase 0)
**Method**: STRIDE per Microsoft Threat Modeling
**Scope**: Each primitive in v3.0 MVP

## STRIDE categories

- **S**poofing — pretending to be someone else
- **T**ampering — modifying data in transit or at rest
- **R**epudiation — denying an action was taken
- **I**nformation Disclosure — exposing secrets or PII
- **D**enial of Service — making the service unavailable
- **E**levation of Privilege — gaining unauthorized access

---

## Magic-Link

### Spoofing
- **Threat**: Attacker tries to verify a token for a different email.
- **Mitigation**: Token is 32 bytes (256 bits) random, base64url. Storage includes `emailHash` (HMAC of email with secret). On verify, recompute hash and compare with stored. **Constant-time compare.**
- **Residual risk**: Email interception (out of scope of primitive; consumer's transport responsibility).

### Tampering
- **Threat**: Attacker modifies the token in URL.
- **Mitigation**: Token is opaque (256 bits). Any modification makes it invalid (storage lookup miss). Atomic delete prevents replay (single-use).

### Repudiation
- **Threat**: User denies requesting the magic-link.
- **Mitigation**: Storage includes `requestedAt`, `ip` (optional), `userAgent` (optional). All logged structurally. Consumer can retain for audit.

### Information Disclosure
- **Threat**: Magic-link URL leaks via Referer header or logs.
- **Mitigation**: Token never contains PII. Token is opaque. Referrer policy: consumer's responsibility (`Referrer-Policy: no-referrer`).
- **Residual risk**: Email inbox itself is PII-leak. Consumer's transport responsibility.

### Denial of Service
- **Threat**: Attacker floods magic-link requests for many emails.
- **Mitigation**: Per-email rate limit (default: 1 per 60s, 5 per hour). Per-IP rate limit (default: 10 per hour). Both enforced at `magicLinkRequest` via `rateLimit` primitive.
- **Residual risk**: Storage adapter under load. Consumer scales DDB.

### Elevation of Privilege
- **Threat**: Verify a token for an admin email.
- **Mitigation**: Primitive doesn't know about roles. Consumer's responsibility. Recommend: include `roles` in storage payload and check in consumer code.

---

## JWT

### Spoofing
- **Threat**: Attacker forges a JWT with `alg: none` (CVE-2015-9235 classic).
- **Mitigation**: `verifyJWT` EXPLICITLY rejects `alg: none` and `alg: HS256\0` (CVE-2018-0114). Only accepts algs in allow-list (default: HS256, EdDSA).
- **Test**: see `tests/auth/jwt.test.ts` `rejects alg: none`, `rejects alg confusion`.

### Tampering
- **Threat**: Attacker modifies claims (e.g., `role: admin`).
- **Mitigation**: Signature verification. Any modification breaks the signature.
- **Threat**: Key confusion (HS256 vs RS256) — see CVE-2016-10555.
- **Mitigation**: `verifyJWT` checks alg matches the key type.

### Repudiation
- **Threat**: Issuer denies signing a token.
- **Mitigation**: All sign events are logged structurally with `keyId`, `alg`, `claims` (excluding PII). Consumer can retain.

### Information Disclosure
- **Threat**: JWT payload contains PII (email, name) leaked in logs.
- **Mitigation**: Default claims are minimal: `sub`, `iat`, `exp`, `nbf`, `iss`, `aud`. `email` and other PII are NOT in default claims. Consumer opts in explicitly.
- **Residual risk**: Storage layer. Consumer's responsibility.

### Denial of Service
- **Threat**: Attacker floods verify with bogus tokens.
- **Mitigation**: Each verify involves HMAC compute (microseconds) or signature check. No DB lookup. Rate limit at the edge (consumer-implemented).

### Elevation of Privilege
- **Threat**: Forge an admin token.
- **Mitigation**: Signature verification (as above). `aud` claim must match consumer's API. Consumer's responsibility.

---

## Cookie (sealed)

### Spoofing
- **Threat**: Attacker forges a cookie.
- **Mitigation**: HMAC-SHA256 signature. Wrong secret → invalid signature → reject.
- **Threat**: Key confusion — consumer uses Cookie A's key for Cookie B.
- **Mitigation**: `cookieSign` and `cookieVerify` take the secret as parameter. No default key.

### Tampering
- **Threat**: Modify cookie payload.
- **Mitigation**: HMAC-SHA256 signature. Tampering breaks signature.
- **Threat**: Replay across rotation.
- **Mitigation**: Cookie includes `iat` and `exp`. Consumer checks via `verifyCookie`.

### Repudiation
- **Threat**: User denies signing in.
- **Mitigation**: `iat` (issued-at) and `requestId` are logged. Audit trail.

### Information Disclosure
- **Threat**: Cookie payload contains PII, leaked to JS (XSS).
- **Mitigation**: Cookies are signed but **NOT encrypted by default**. Consumer must use HttpOnly + Secure. For encrypted cookies (PII), use JWE in v3.1.
- **Test**: see `tests/auth/cookie.test.ts` `rejects XSS exfiltration attempt` (simulated).

### Denial of Service
- **Threat**: Attacker sends huge cookies.
- **Mitigation**: Cookie size limit (4KB browser limit, but OCAIS enforces 2KB max payload).

### Elevation of Privilege
- **Threat**: Modify cookie to escalate.
- **Mitigation**: Same as Tampering.

---

## Password (Argon2id)

### Spoofing
- **Threat**: Brute force password.
- **Mitigation**: Argon2id with OWASP-recommended parameters (memory=19MB, iterations=2, parallelism=1). Rate limit on `passwordVerify` (5 attempts per minute per email).

### Tampering
- **Threat**: Modify stored hash.
- **Mitigation**: Hash includes per-password salt (Argon2id built-in).

### Repudiation
- **Threat**: User denies creating account.
- **Mitigation**: `createdAt`, `ip`, `userAgent` logged at `passwordHash` time.

### Information Disclosure
- **Threat**: Hash leak → offline brute force.
- **Mitigation**: Argon2id memory-hard (19MB per attempt, parallelized attacks expensive). Plus: long, unique passwords still safe even if hash leaks.

### Denial of Service
- **Threat**: Attacker triggers many `passwordHash` calls (CPU + memory).
- **Mitigation**: Rate limit on `passwordHash` (1 per email per second). Consumer scales.

### Elevation of Privilege
- **Threat**: Bypass password check.
- **Mitigation**: Constant-time compare (Argon2id built-in). No timing side-channel.

---

## Rate Limit

### Spoofing
- **Threat**: Attacker uses fake source IP.
- **Mitigation**: Out of scope. Consumer should use AWS WAF / CloudFront for IP allowlist.

### Tampering
- **Threat**: Attacker resets counter by deleting storage key.
- **Mitigation**: Out of scope. Consumer chooses storage with durability.

### Information Disclosure
- **Threat**: Rate-limit keys leak user behavior.
- **Mitigation**: Default key includes HMAC of source identifier. Hash, don't store raw IP/email.

### Denial of Service
- **Threat**: Distributed DoS.
- **Mitigation**: Per-key, per-instance. Multi-instance aggregation is consumer's responsibility (e.g., via storage adapter).

---

## Cross-cutting threats

### Key rotation
- **Threat**: Compromised signing key.
- **Mitigation**: `rotateKeys` generates new key. Old key marked as deprecated (24h grace). All new tokens use new key; old tokens still verify.
- **Test**: see `tests/auth/jwt.test.ts` `supports key rotation with 24h grace`.

### Replay attacks
- **Threat**: Token stolen and replayed.
- **Mitigation**:
  - Magic-link: atomic delete (single-use)
  - JWT: short `exp` (default 15min) + revocation list (DDB key `REVOKE#<jti>`)
  - Cookie: tied to TLS (Secure flag), `SameSite=Lax` (CSRF mitigation)

### Race conditions in magic-link
- **Threat**: Two parallel verify calls with same token → both succeed.
- **Mitigation**: `DeleteItem` with `ReturnValues: ALL_OLD` is atomic in DDB. Consumer uses `ConditionExpression: attribute_exists(token)`. If delete fails, second verify gets null.

### Storage layer injection
- **Threat**: SQL/NoSQL injection via token field.
- **Mitigation**: Storage adapter interface uses parameterized queries (consumer-implemented). OCAIS passes `token` as separate parameter, never string-interpolates.

### Side-channel timing
- **Threat**: HMAC compare timing leaks signature.
- **Mitigation**: All HMAC compares use constant-time. Built into `crypto.subtle.verify` and noble's primitives.

---

## Threat model coverage matrix

| Threat | Magic-link | JWT | Cookie | Password | Rate Limit |
|---|---|---|---|---|---|
| Spoofing | ✓ | ✓ | ✓ | ✓ | partial |
| Tampering | ✓ | ✓ | ✓ | ✓ | n/a |
| Repudiation | ✓ | ✓ | ✓ | ✓ | n/a |
| Info Disclosure | ✓ | ✓ | ✓ | ✓ | ✓ |
| Denial of Service | ✓ | ✓ | ✓ | ✓ | ✓ |
| Elevation of Privilege | ✓ | ✓ | ✓ | ✓ | n/a |

`partial` = consumer-implemented. `n/a` = not applicable to this primitive.
