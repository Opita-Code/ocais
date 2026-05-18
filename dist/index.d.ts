/**
 * OCAIS — Opita Code AI Stream
 *
 * Lightweight AI streaming SDK for AWS Lambda.
 * Zero dependencies. TypeScript-first. Provider-agnostic.
 *
 * @packageDocumentation
 */
export { streamText } from "./stream-text.js";
export { generateObject } from "./generate-object.js";
export { openai } from "./providers/openai-compatible.js";
export { google } from "./providers/google.js";
export { createSSEWriter } from "./lambda/sse-writer.js";
export type { Message, SystemMessage, UserMessage, AssistantMessage, ToolResultMessage, ContentPart, ToolDefinition, ToolCall, JsonSchema, StreamChunk, Provider, ProviderRequest, ProviderResponse, ProviderMessage, StreamTextOptions, GenerateObjectOptions, GenerateObjectResult, } from "./types.js";
export type { SSEWriter, SSEWritableStream } from "./lambda/sse-writer.js";
export type { OpenAIProviderOptions } from "./providers/openai-compatible.js";
export type { GoogleProviderOptions } from "./providers/google.js";
//# sourceMappingURL=index.d.ts.map