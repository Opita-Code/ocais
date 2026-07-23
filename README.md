# OCAIS — Opita Code AI Stream

> Lightweight AI streaming SDK for AWS Lambda. **Zero deps. TypeScript-first. Provider-agnostic.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-green.svg)](https://nodejs.org/)

## Why OCAIS?

Other SDKs (Vercel AI SDK, LangChain) are designed for fullstack web frameworks. **OCAIS is designed for a single use case: streaming AI in AWS Lambda with SSE.**

| | Vercel AI SDK | OCAIS |
|---|---|---|
| Bundle | ~2.8 MB | ~15 KB |
| Dependencies | 30+ transitive | 0 |
| Target | Next.js, React | AWS Lambda |
| Tool execution | Optional | First-class with `execute` |
| Cancellation | `AbortController` | `AbortSignal` + `timeoutMs` |
| Errors | Generic | Typed hierarchy |

## Install

```bash
# From GitHub (no npm registry yet)
npm install github:Opita-Code/ocais#master
```

## Quick start

### Streaming with DeepSeek

```typescript
import { streamText, openai } from "@opitacode/ocais";

const stream = streamText({
  provider: openai({
    apiKey: process.env.DEEP_SEEK_KEY!,
    baseURL: "https://api.deepseek.com",
  }),
  model: "deepseek-chat",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  if (chunk.type === "text") process.stdout.write(chunk.text);
}
```

### Streaming with Google Gemini

```typescript
import { streamText, google } from "@opitacode/ocais";

const stream = streamText({
  provider: google({ apiKey: process.env.API_GOOGLE_CLOUD! }),
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "Hello" }],
});
```

### In AWS Lambda (Function URL + SSE)

```typescript
import { streamText, openai, createSSEWriter } from "@opitacode/ocais";

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    const writer = createSSEWriter(responseStream);
    const body = JSON.parse(event.body || "{}");

    const stream = streamText({
      provider: openai({
        apiKey: process.env.DEEP_SEEK_KEY!,
        baseURL: "https://api.deepseek.com",
      }),
      model: "deepseek-chat",
      system: "Eres Aura, asistente de Vibe Studio.",
      messages: body.messages,
    });

    for await (const chunk of stream) {
      writer.write(chunk);
    }
    writer.done();
  },
);
```

### Server-side tool execution (multi-step)

```typescript
import { streamText, openai } from "@opitacode/ocais";

const stream = streamText({
  provider: openai({ apiKey, baseURL: "https://api.deepseek.com" }),
  model: "deepseek-chat",
  system: "You can check the weather and book flights.",
  messages: [{ role: "user", content: "Book me a flight to Bogotá" }],
  tools: {
    getWeather: {
      description: "Get weather for a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
      execute: async ({ city }) => {
        return { temp: 22, condition: "sunny" };
      },
    },
    bookFlight: {
      description: "Book a flight",
      parameters: { type: "object", properties: { to: { type: "string" } } },
      execute: async ({ to }) => ({ confirmation: `Flight to ${to} booked` }),
    },
  },
  maxSteps: 5, // up to 5 LLM round-trips
});

for await (const chunk of stream) {
  if (chunk.type === "text") process.stdout.write(chunk.text);
  if (chunk.type === "tool-call") console.log("tool:", chunk.toolName, chunk.args);
  if (chunk.type === "tool-result") console.log("result:", chunk.result);
}
```

### Structured output (Zod)

```typescript
import { generateObject, google } from "@opitacode/ocais";
import { z } from "zod";

const { object } = await generateObject({
  provider: google({ apiKey }),
  model: "gemini-2.5-flash",
  schema: z.object({
    name: z.string(),
    age: z.number(),
  }),
  prompt: "Generate a fictional person",
});
// object: { name: string; age: number }
```

## Cancellation

Use standard `AbortSignal` and/or `timeoutMs`. Both throw typed errors.

```typescript
import { streamText, OCAISAbortError, OCAISTimeoutError } from "@opitacode/ocais";

// AbortSignal (e.g. from a request)
const controller = new AbortController();
req.on("close", () => controller.abort());

try {
  for await (const chunk of streamText({
    provider: openai({ apiKey }),
    model: "deepseek-chat",
    messages: [{ role: "user", content: "Long task" }],
    signal: controller.signal,
  })) {
    if (chunk.type === "text") process.stdout.write(chunk.text);
  }
} catch (err) {
  if (err instanceof OCAISAbortError) {
    // request was closed by client
  } else if (err instanceof OCAISTimeoutError) {
    // exceeded timeoutMs
    console.log(`Timed out after ${err.elapsedMs}ms (limit: ${err.timeoutMs}ms)`);
  } else {
    throw err;
  }
}

// Or just timeoutMs without an explicit AbortController
for await (const chunk of streamText({
  ...,
  timeoutMs: 5000, // throw OCAISTimeoutError if it takes >5s
})) { ... }
```

## Observability

Pass lifecycle hooks to track requests without wrapping the stream:

```typescript
for await (const chunk of streamText({
  provider: openai({ apiKey }),
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hi" }],
  onStart: (ctx) => {
    console.log(`[start] model=${ctx.model} tools=${ctx.toolNames?.join(",")}`);
  },
  onComplete: (ctx) => {
    console.log(
      `[complete] steps=${ctx.steps} duration=${ctx.durationMs}ms ` +
      `tokens=${ctx.usage?.totalTokens ?? "?"}`,
    );
  },
  onError: (ctx) => {
    console.error(`[error] step=${ctx.step}`, ctx.error);
  },
  onAbort: () => {
    console.warn("[abort]");
  },
})) {
  // consume
}
```

For a richer event-based API (subscribe to `text`, `tool-call`, `complete`, etc.), use `streamTextWithEvents` (planned for v2.1).

## Error hierarchy

All OCAIS errors extend `OCAISError` for easy `instanceof` checks:

```
OCAISError (base)
├── OCAISAbortError        // user cancelled via AbortSignal
├── OCAISTimeoutError      // exceeded timeoutMs (has .timeoutMs, .elapsedMs)
├── OCAISParseError        // malformed JSON, SSE parse error (has .raw)
├── OCAISToolError         // tool execute() threw (has .toolName, .toolCallId)
└── OCAISProviderError     // provider returned non-2xx (has .provider, .status)
```

## API Reference

### `streamText(options)`

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `provider` | `Provider` | ✅ | — | Provider instance (`openai()`, `google()`) |
| `model` | `string` | ✅ | — | Model name (e.g. `deepseek-chat`, `gemini-2.5-flash`) |
| `messages` | `Message[]` | ✅ | — | Conversation history |
| `system` | `string` | — | — | System prompt |
| `tools` | `Record<string, ToolDefinition>` | — | — | Tools available to the model |
| `temperature` | `number` | — | — | Sampling temperature |
| `maxTokens` | `number` | — | — | Max output tokens |
| `maxSteps` | `number` | — | `5` | Max LLM round-trips (for tool execution) |
| `signal` | `AbortSignal` | — | — | Cancel the operation |
| `timeoutMs` | `number` | — | — | Throw after N milliseconds |
| `onStart` | `(ctx) => void` | — | — | Called before the first request |
| `onComplete` | `(ctx) => void` | — | — | Called after successful stream |
| `onError` | `(ctx) => void` | — | — | Called on any error |
| `onAbort` | `() => void` | — | — | Called when signal/timeout fires |

### `generateObject(options)`

Same as `streamText` except:
- `prompt: string` (replaces `messages` + `system`)
- `schema: ZodSchema` (required) — validates the output

### `createSSEWriter(stream)`

Helper for writing to AWS Lambda's `responseStream` in SSE format. See [Lambda example](#in-aws-lambda-function-url--sse).

## Providers

| Provider | Constructor | Compatible APIs |
|---|---|---|
| OpenAI-compatible | `openai({ apiKey, baseURL? })` | OpenAI, DeepSeek, OpenRouter, Groq, etc. |
| Google Gemini | `google({ apiKey })` | Gemini 1.5, 2.0, 2.5 |

## Roadmap

- [x] Streaming text (v1.0)
- [x] Server-side tool execution with multi-step (v1.0)
- [x] Structured output via Zod (v1.0)
- [x] AbortSignal + timeout + typed errors (v2.0)
- [x] Observability hooks (v2.0)
- [ ] Anthropic Claude provider (v2.1)
- [ ] `streamObject` — streaming structured output (v2.1)
- [ ] Local Ollama provider (v2.1)
- [ ] Event-based observability API (v2.1)
- [ ] Pre-built cultural prompt helpers (v2.2)

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test --experimental-strip-types tests/*.test.ts
```

## License

MIT © [Opita Code](https://opitacode.com)
