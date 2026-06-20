# OCAIS Architecture

This document explains how OCAIS is structured internally. For usage docs, see [README.md](../README.md). For upgrading from v1, see [migration-v1-to-v2.md](migration-v1-to-v2.md).

## High-level

```
┌─────────────────────────────────────────────────────────────────┐
│                       streamText() / generateObject()              │
│                          (public API)                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────┐          ┌──────────────────────┐
│   Tool execution │          │  Provider abstraction │
│   loop + hooks   │          │  (openai / google)   │
└──────────────────┘          └──────────┬───────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │   HTTP fetch + SSE     │
                            │   (signal-aware)       │
                            └───────────────────────┘
```

## Key concepts

### 1. The `Provider` interface

Every AI backend (OpenAI, Google, Anthropic, custom) implements:

```typescript
interface Provider {
  readonly name: string;
  streamChatCompletion(req: ProviderRequest): AsyncIterable<StreamChunk>;
  chatCompletion(req: ProviderRequest): Promise<ProviderResponse>;
}
```

Providers are **stateless** — they only hold config (apiKey, baseURL). All conversation state lives in the caller's `messages: Message[]` array. This makes providers easy to test (mock `globalThis.fetch`) and easy to swap.

The `ProviderRequest` includes an optional `signal?: AbortSignal`. Providers should pass it to `fetch()` so the in-flight HTTP request can be cancelled.

### 2. Stream chunks

The SDK normalizes provider-specific responses into a small set of `StreamChunk` types:

```typescript
type StreamChunk =
  | { type: "text"; text: string }                    // model output
  | { type: "reasoning"; text: string }               // chain-of-thought (DeepSeek)
  | { type: "tool-call"; toolCallId: string; ... }     // model wants to call a tool
  | { type: "tool-result"; toolCallId: string; ... }  // tool returned a result
  | { type: "usage"; promptTokens: number; ... }      // token counts (when available)
  | { type: "error"; error: string }                   // provider error
  | { type: "done" };                                 // stream complete
```

The consumer (`streamText`) decides what to do with each chunk. The provider just emits them as they arrive.

### 3. The tool execution loop

When `streamText` receives a `tool-call` chunk and the tool has a server-side `execute` function, the SDK:

1. **Buffers** all `tool-call` chunks in the current step
2. After the provider emits `done` (or `finish_reason === "tool_calls"`), **executes** each tool with the parsed args
3. **Appends** an `assistant` message (with `toolCalls`) and a `tool` message (with the result) to the conversation
4. **Loops** back to step 1, sending the updated conversation to the provider
5. Stops when: no more tool calls, OR `maxSteps` reached, OR `signal`/timeout fires

```typescript
// Default maxSteps is 5
for await (const chunk of streamText({
  ...,
  tools: {
    getWeather: { ..., execute: async ({ city }) => ({ temp: 22 }) },
  },
})) {
  // yields text + tool-call + tool-result chunks
}
```

### 4. Cancellation

`streamText` and `generateObject` accept `signal: AbortSignal` and `timeoutMs: number`. Internally they:

1. Create a combined `AbortController` that fires when **either** the user's signal aborts **or** the timeout elapses
2. Pass the combined `signal` to the provider (which passes it to `fetch()`)
3. **Check** the combined signal between stream chunks
4. **Catch** fetch errors and check if the signal caused them
5. Throw a typed error (`OCAISAbortError` or `OCAISTimeoutError`)

This means cancellation works at three levels: HTTP request, stream loop, and consumer iterator.

### 5. Observability

Four optional lifecycle hooks:

| Hook | When | Use for |
|---|---|---|
| `onStart(ctx)` | Before first provider call | Logging, tracing spans |
| `onComplete(ctx)` | After successful stream end | Latency tracking, cost monitoring |
| `onError(ctx)` | On any thrown error | Error reporting, retries |
| `onAbort()` | On signal/timeout fire | Cancellation analytics |

The context objects include `model`, `steps`, `durationMs`, `usage`, and timestamps.

For richer event-based observability (subscribe to `text`, `tool-call`, etc.), see [Roadmap in README](../README.md#roadmap).

## File-by-file

### `src/index.ts`
The public surface. Re-exports `streamText`, `generateObject`, providers, error classes, and types.

### `src/stream-text.ts`
The main streaming function. ~250 lines. Handles:
- Signal + timeout setup (`createCombinedSignal` helper)
- Message conversion to provider format
- Tool execution loop with `maxSteps`
- Observability hooks
- Error mapping (abort → `OCAISAbortError`, timeout → `OCAISTimeoutError`)

### `src/generate-object.ts`
Structured output. ~150 lines. Handles:
- Zod schema → JSON Schema conversion (multiple strategies: `zod.toJSONSchema()`, dynamic import of `zod-to-json-schema`, fallback)
- Provider-specific response format (Gemini uses `json_schema`, others use `json_object` + schema-in-prompt)
- Validation with Zod
- Signal + timeout + observability

### `src/errors.ts`
The error hierarchy. ~80 lines. Each error extends `OCAISError` which extends `Error`. The `name` is set via `this.name = new.target.name` so subclasses get the right class name for `instanceof` debugging.

### `src/types.ts`
All public types. ~200 lines. Organized as:
- Messages (System, User, Assistant, ToolResult)
- Content parts (text, image, file)
- Tools (ToolDefinition, ToolCall, JsonSchema)
- Stream chunks
- Provider interface
- Options for `streamText` and `generateObject`
- Observability contexts

### `src/providers/openai-compatible.ts`
The OpenAI-compatible provider. ~220 lines. Handles:
- SSE parsing of streaming responses
- Tool call accumulation (OpenAI sends them incrementally across chunks)
- Usage tracking
- `signal` propagation to `fetch()`

### `src/providers/google.ts`
The Google Gemini provider. Uses `json_schema` for structured output (Gemini-specific).

### `src/lambda/sse-writer.ts`
Helper for AWS Lambda's `responseStream` (the new "function URLs" pattern). Wraps writes in SSE format with proper metadata flags.

## Testing strategy

- All tests use `node:test` (built-in, no Jest/Vitest)
- HTTP is mocked via `globalThis.fetch = ...`
- Mocks respect `AbortSignal` to test cancellation correctly
- Mocks return SSE format (not JSON) to test streaming
- Coverage: errors, streamText basic + tools + cancellation + observability, generateObject basic + cancellation

## Design decisions

### Why zero dependencies?

Smaller bundle (15KB vs 2.8MB), faster cold starts in Lambda, no supply-chain risk. We use Node's built-in `fetch` and `TextDecoder` for SSE parsing.

### Why callback hooks instead of EventEmitter?

Simpler API surface, no event listener cleanup, no memory leaks. Callbacks are easier to mock in tests.

### Why `maxSteps: 5` default instead of 1?

v1 default of 1 forced callers to opt into multi-step. Most use cases involve at least 1-2 tool round-trips, so 5 is a better default. Still configurable.

### Why are errors typed as classes instead of union types?

`instanceof` checks are more ergonomic than discriminated union matching, especially for errors that bubble up across async boundaries.

### Why doesn't OCAIS manage conversation state?

Stateful conversation (memory, summarization) is application-level, not SDK-level. OCAIS is a transport. The caller passes `messages: Message[]` each time, and is responsible for managing the array.

## Future direction

See [Roadmap in README](../README.md#roadmap). v2.1 will add Anthropic Claude, `streamObject`, local Ollama, event-based observability, and (maybe) npm registry publish.
