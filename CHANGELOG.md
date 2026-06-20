# Changelog

All notable changes to OCAIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
