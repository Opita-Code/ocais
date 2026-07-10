/**
 * OCAIS — streamText
 *
 * Core streaming function. Calls the provider's streaming API and yields
 * typed StreamChunks. Supports server-side tool execution with multi-step loops.
 *
 * Cancellation: pass `signal` (AbortSignal) and/or `timeoutMs`. Both throw
 * typed errors (OCAISAbortError, OCAISTimeoutError).
 *
 * Observability: pass `onStart`, `onComplete`, `onError`, `onAbort` hooks.
 * For a richer event-based API, see `streamTextWithEvents`.
 */
import type { StreamTextOptions, StreamChunk } from "./types.js";
/**
 * Stream text from an AI provider.
 *
 * Returns an AsyncIterable of StreamChunks. If tools with `execute` functions
 * are provided, the SDK will automatically handle tool execution loops up to
 * `maxSteps` rounds.
 *
 * @example
 * ```ts
 * const stream = streamText({
 *   provider: openai({ apiKey }),
 *   model: 'deepseek-chat',
 *   system: 'You are helpful.',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 *
 * for await (const chunk of stream) {
 *   if (chunk.type === 'text') process.stdout.write(chunk.text);
 * }
 * ```
 */
export declare function streamText(options: StreamTextOptions): AsyncIterable<StreamChunk>;
//# sourceMappingURL=stream-text.d.ts.map