# Peer dependencies

OCAIS keeps its **runtime zero-dep** posture by declaring only what it strictly needs as a direct dependency, and marking other things as optional peer dependencies.

## Quick table

| Feature | Package | Tier | When required | Install |
|---------|---------|------|---------------|---------|
| `generateObject()` (structured output) | `zod` | **direct dep** (3.0.1+) | Always — `generateObject()` calls `.parse()` on your Zod schema | None (auto) |
| `signJWT()` / `verifyJWT()` with `algorithm: "EdDSA"` | `@noble/ed25519` | optional peer | Only if you use EdDSA; HS256 and RS256 work without it | `npm install @noble/ed25519` |
| `passwordHash()` / `passwordVerify()` / `needsRehash()` | `@node-rs/argon2` | optional peer | Only if you use the password primitive | `npm install @node-rs/argon2` |
| `verifyCognitoJWT()` | none | — | Pure fetch — works without extra deps | None |
| `streamText()` / `openai()` / `google()` / `createSSEWriter()` | none | — | Pure fetch (Node 20+) | None |

## Why direct dep for `zod`

`generateObject()` always calls `.parse()` on the user's schema. Marking Zod as optional peer would mean consumers can install OCAIS without Zod and then have `generateObject()` fail at runtime with `Cannot find module 'zod'`. Making it a direct dep fixes install determinism.

If you don't use `generateObject()`, the bundler will tree-shake the Zod path out of your output.

## Why optional peer for `@noble/ed25519` and `@node-rs/argon2`

These add native binaries to your install. Most consumers never use EdDSA (HS256 is the default), and many deployments don't use password hashing (they use magic-link only). Marking both optional lets consumers stay lean.

When you call a function that requires one of these and the package is not installed, OCAIS throws a typed `AuthError("AUTH_DEPENDENCY", "...")` whose message includes the exact install command.

## Versions

- `zod`: `^3.23.0` (direct dep; auto-installed)
- `@noble/ed25519`: `>=2.0.0` (optional peer; install manually)
- `@node-rs/argon2`: `>=2.0.0` (optional peer; install manually)

## How to verify

```bash
npm ls @opitacode/ocais
# Should show zod in dependencies; the others only if you installed them.
```
