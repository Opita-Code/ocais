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
//# sourceMappingURL=index.js.map