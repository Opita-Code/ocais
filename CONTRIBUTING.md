# Contributing to OCAIS

Thank you for your interest in improving OCAIS! This document explains how to set up a development environment, run tests, and submit changes.

## Project layout

```
ocais/
├── src/
│   ├── index.ts              # public exports
│   ├── stream-text.ts        # streamText() — streaming chat completion
│   ├── generate-object.ts    # generateObject() — structured output
│   ├── errors.ts             # OCAISError hierarchy
│   ├── types.ts              # public types
│   ├── providers/
│   │   ├── openai-compatible.ts
│   │   └── google.ts
│   └── lambda/
│       └── sse-writer.ts     # helper for AWS Lambda responseStream
├── tests/                    # node:test + fetch mocking
│   ├── errors.test.ts
│   ├── stream-text.test.ts
│   └── generate-object.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Development setup

```bash
git clone https://github.com/Opita-Code/ocais.git
cd ocais
npm install
```

**Requirements**: Node.js ≥ 20 (we test on Node 20, 22, 24). TypeScript 5.7+.

## Scripts

| Script | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` — verify types compile cleanly |
| `npm test` | Run all tests with `node --test --experimental-strip-types` |
| `npm run build` | `tsc` — emit `dist/` |
| `npm run clean` | Remove `dist/` |

## Coding conventions

### Style

- TypeScript strict mode (`tsc --noEmit` must pass)
- Zero runtime dependencies — any new dep must be justified
- Public types go in `src/types.ts`
- New error types extend `OCAISError` from `src/errors.ts`
- Provider implementations live in `src/providers/<name>.ts`
- Use `node:` prefix for Node.js built-ins (e.g. `node:test`, `node:assert/strict`)

### Testing

- Tests use `node:test` + `node:assert/strict` — no third-party test framework
- Mock `globalThis.fetch` for HTTP, don't hit real providers
- Each test should be self-contained and deterministic
- Test names should describe the behavior: `streamText: cancellation` → `throws OCAISAbortError when signal is already aborted`

### Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Subject line ≤ 72 chars
- Body explains *why*, not *what* (the diff shows what)
- Reference issues with `Closes #123` or `Refs #456`

### Branches and PRs

- Create a branch from `master`: `git checkout -b feat/my-feature`
- One logical change per PR
- PR title and description should explain the *user-facing* change
- All tests must pass (`npm test`)
- Typecheck must pass (`npm run typecheck`)
- New features should include tests

## Adding a new provider

1. Create `src/providers/<name>.ts` implementing the `Provider` interface from `src/types.ts`
2. The provider should:
   - Accept its config (apiKey, baseURL, etc.) as constructor args
   - Implement `streamChatCompletion` (returns `AsyncIterable<StreamChunk>`)
   - Implement `chatCompletion` (returns `Promise<ProviderResponse>`)
   - Pass `req.signal` to `fetch()` for cancellation support
3. Add tests in `tests/<name>.test.ts` with mocked fetch
4. Export from `src/index.ts`
5. Add usage example to `README.md`

## Release process

OCAIS uses [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): breaking changes (e.g. `maxSteps` default change in 2.0.0)
- **MINOR** (0.X.0): new features that are backward-compatible
- **PATCH** (0.0.X): bug fixes

Releases are tagged on `master` after a maintainer review. Update `CHANGELOG.md` and bump `version` in `package.json` in the same PR as the change.

## Code of conduct

Be respectful, constructive, and assume good intent. This is a public SDK used by production workloads.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
