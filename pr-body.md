## OCAIS v2.0 — General update, no Sociedad-Opita-specific

This update brings OCAIS to a **general production-ready state**, without coupling to any specific consumer (Sociedad Opita, Vibe Studio, etc.). Sociedad Opita and any other consumer wraps OCAIS in their own repos.

## What's new

### 🔴 Cancellation (standard web API)

```typescript
import { streamText, OCAISAbortError, OCAISTimeoutError } from "@opita/ocais";

const controller = new AbortController();
req.on("close", () => controller.abort());

try {
  for await (const chunk of streamText({
    provider: openai({ apiKey }),
    model: "deepseek-chat",
    messages: [{ role: "user", content: "Long task" }],
    signal: controller.signal,   // AbortSignal support
    timeoutMs: 5000,            // Or timeout in ms
  })) {
    if (chunk.type === "text") process.stdout.write(chunk.text);
  }
} catch (err) {
  if (err instanceof OCAISAbortError) { /* client cancelled */ }
  if (err instanceof OCAISTimeoutError) { /* exceeded timeoutMs */ }
}
```

### 🔴 Typed error hierarchy

```
OCAISError (base)
├── OCAISAbortError         — signal fired
├── OCAISTimeoutError       — exceeded timeoutMs (has .timeoutMs, .elapsedMs)
├── OCAISParseError         — malformed JSON/SSE (has .raw)
├── OCAISToolError          — tool execute() threw (has .toolName, .toolCallId)
└── OCAISProviderError      — provider returned non-2xx (has .provider, .status)
```

All extend `OCAISError` for easy `instanceof` checks.

### 🔴 Observability hooks (no event emitter — just callback options)

```typescript
for await (const chunk of streamText({
  provider: openai({ apiKey }),
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hi" }],
  onStart: (ctx) => log.info(`start model=${ctx.model} tools=${ctx.toolNames}`),
  onComplete: (ctx) => log.info(`complete steps=${ctx.steps} duration=${ctx.durationMs}ms tokens=${ctx.usage?.totalTokens}`),
  onError: (ctx) => log.error(`error step=${ctx.step}`, ctx.error),
  onAbort: () => log.warn("aborted"),
})) { /* ... */ }
```

### 🟡 maxSteps default raised from 1 to 5

Reasonable for multi-step tool execution. Still configurable.

### 🟡 Tests (17 tests, 0 deps, all green)

`node --test --experimental-strip-types tests/*.test.ts` — no external API calls, all mocks.

- `errors.test.ts` — 5 tests for error hierarchy
- `stream-text.test.ts` — 8 tests (basic, tools, cancellation, observability)
- `generate-object.test.ts` — 4 tests (basic, cancellation)

### 🟢 README + JSDoc + examples

Complete rewrite of README with cancellation section, observability section, error hierarchy, and roadmap.

## Breaking changes from v1

| Change | Migration |
|---|---|
| `maxSteps` default: 1 → 5 | Pass `maxSteps: 1` explicitly if you need single-turn |
| `ProviderRequest` adds optional `signal` | Additive — providers ignoring it still work |

## What this PR does NOT include (deferred to v2.1+)

- Anthropic Claude provider
- `streamObject` (streaming structured output)
- Local Ollama provider
- Event-based observability API (currently only callbacks)
- Pre-built cultural prompt helpers
- Publish to npm registry (still `github:Opita-Code/ocais#master`)

These are tracked in the README's Roadmap section. They are NOT Sociedad-Opita-specific.

## Stats

- 12 files changed, +1270/-195
- 17 tests, all passing in 312ms
- 0 new runtime dependencies (zod is `peerDependencies`, `@types/node` is `devDependencies` only)
- Bundle size impact: `errors.ts` adds ~1.5 KB

## Verification

```bash
$ npm install
$ npm run typecheck    # tsc --noEmit, passes
$ npm test             # 17/17 passing
```
