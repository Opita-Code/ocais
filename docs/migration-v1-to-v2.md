# Migrating from OCAIS v1 to v2

This guide covers the breaking changes in v2.0.0 and how to update your code.

## TL;DR

| Change | Required action |
|---|---|
| `maxSteps` default: 1 → 5 | Pass `maxSteps: 1` if you need single-turn |
| New errors thrown in some cases | Wrap with `try/catch` if you don't already |
| `ProviderRequest` adds optional `signal` | No action — additive, backward-compatible |
| New exports: error classes, `Usage` type | Optional — import if you need them |

## Breaking change: `maxSteps` default

v1.0.0 defaulted to `maxSteps: 1`, meaning the SDK would NOT auto-execute tools even if they had an `execute` function. Callers had to opt in with `maxSteps: 5` or higher.

v2.0.0 defaults to `maxSteps: 5`. This is a better default for most tool-using apps.

### Migration

If you relied on the old behavior (no tool execution), explicitly set `maxSteps: 1`:

```typescript
// v1 (default)
await streamText({ ..., tools: { ... } });

// v2 equivalent of v1 behavior
await streamText({ ..., tools: { ... }, maxSteps: 1 });
```

If you were already passing `maxSteps: 5` or higher, no change.

## New: typed errors

v2 throws typed errors in cases where v1 would throw generic `Error`:

| Trigger | v1 | v2 |
|---|---|---|
| User cancels via `AbortSignal` | Generic `Error` | `OCAISAbortError` |
| `timeoutMs` exceeded | Generic `Error` | `OCAISTimeoutError` (with `.timeoutMs`, `.elapsedMs`) |
| Provider returns non-2xx | Generic `Error` | `OCAISProviderError` (with `.status`, `.provider`) |
| Malformed JSON in `generateObject` | Generic `Error` | `OCAISParseError` (with `.raw`) |
| Tool `execute()` throws | `error` chunk yielded + text continues | `OCAISToolError` (with `.toolName`, `.toolCallId`) |

### Migration

If you have `try/catch` blocks that match specific error messages, switch to `instanceof` checks:

```typescript
// v1
try {
  for await (const chunk of streamText(...)) { ... }
} catch (err) {
  if (err.message === "aborted") { /* ... */ }
}

// v2
import { OCAISAbortError, OCAISTimeoutError } from "@opitacode/ocais";

try {
  for await (const chunk of streamText(...)) { ... }
} catch (err) {
  if (err instanceof OCAISAbortError) { /* client cancelled */ }
  if (err instanceof OCAISTimeoutError) { /* exceeded timeoutMs */ }
}
```

Or catch all OCAIS errors with the base class:

```typescript
import { OCAISError } from "@opitacode/ocais";

try { ... } catch (err) {
  if (err instanceof OCAISError) {
    // any OCAIS-specific error
  } else {
    throw err; // not from OCAIS
  }
}
```

## New: optional `signal` in `ProviderRequest`

The `Provider` interface now accepts `signal?: AbortSignal` in `ProviderRequest`. **This is additive** — providers that ignore it still work. But if you're implementing a custom provider, you should pass it to `fetch()`:

```typescript
const response = await fetch(url, {
  method: "POST",
  ...,
  signal: req.signal,  // enables real HTTP cancellation
});
```

Without this, cancelling the `signal` won't actually cancel the in-flight request — it will just stop the SDK from processing the response.

## New: observability hooks

v2 adds `onStart`, `onComplete`, `onError`, `onAbort` callbacks. These are purely additive — if you don't pass them, behavior is identical to v1.

```typescript
// v1
await streamText({ provider, model, messages });

// v2 with hooks
await streamText({
  provider, model, messages,
  onStart: (ctx) => log(`start model=${ctx.model}`),
  onComplete: (ctx) => log(`complete steps=${ctx.steps} duration=${ctx.durationMs}ms`),
  onError: (ctx) => log.error(`error step=${ctx.step}`, ctx.error),
  onAbort: () => log.warn("aborted"),
});
```

## New: explicit `Usage` type

If you were parsing usage from stream chunks, the shape is now a public type:

```typescript
import type { Usage } from "@opitacode/ocais";

function trackUsage(usage: Usage | undefined) {
  if (!usage) return;
  metrics.histogram("llm.tokens.total", usage.totalTokens);
  metrics.histogram("llm.tokens.prompt", usage.promptTokens);
  metrics.histogram("llm.tokens.completion", usage.completionTokens);
}

for await (const chunk of streamText(..., { onComplete: (ctx) => trackUsage(ctx.usage) })) {
  // ...
}
```

## Checklist

- [ ] If you have `try/catch` blocks, update them to use `instanceof OCAISXxxError`
- [ ] If you rely on `maxSteps: 1` default, add `maxSteps: 1` explicitly
- [ ] If you implement a custom `Provider`, pass `req.signal` to `fetch()`
- [ ] Update your package.json to `"@opitacode/ocais": "github:Opita-Code/ocais#v2.0.0"` (when tagged) or `^2.0.0` once published to npm
