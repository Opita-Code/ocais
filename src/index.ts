/**
 * OCAIS — Opita Code AI Stream
 *
 * Lightweight AI streaming SDK for AWS Lambda.
 * Zero dependencies. TypeScript-first. Provider-agnostic.
 *
 * @packageDocumentation
 */

// Core functions
export { streamText } from "./stream-text.js";
export { generateObject } from "./generate-object.js";

// Providers
export { openai } from "./providers/openai-compatible.js";
export { google } from "./providers/google.js";

// Lambda helpers
export { createSSEWriter } from "./lambda/sse-writer.js";

// Errors
export {
  OCAISError,
  OCAISAbortError,
  OCAISTimeoutError,
  OCAISParseError,
  OCAISToolError,
  OCAISProviderError,
} from "./errors.js";

// Types
export type {
  // Messages
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  ContentPart,

  // Tools
  ToolDefinition,
  ToolCall,
  JsonSchema,

  // Stream
  StreamChunk,
  Usage,

  // Provider
  Provider,
  ProviderRequest,
  ProviderResponse,
  ProviderMessage,

  // Options
  StreamTextOptions,
  GenerateObjectOptions,
  GenerateObjectResult,

  // Observability
  StartContext,
  CompleteContext,
  ErrorContext,
} from "./types.js";

export type { SSEWriter, SSEWritableStream } from "./lambda/sse-writer.js";
export type { OpenAIProviderOptions } from "./providers/openai-compatible.js";
export type { GoogleProviderOptions } from "./providers/google.js";

// v3.0 — Auth primitives (see `./auth/` for details)
// Note: consumers should import from "@opitacode/ocais/auth" directly, not from the root.
// The root re-export is for convenience and to surface the auth module in the package.
export * as auth from "./auth/index.js";
