/**
 * OCAIS — generateObject
 *
 * Generates a structured JSON object from an AI provider.
 * Uses JSON mode or response_format depending on provider capabilities.
 * Validates output with the provided Zod schema.
 */
import type { GenerateObjectOptions, GenerateObjectResult } from "./types.js";
/**
 * Generate a structured object from an AI provider.
 *
 * The schema should be a Zod schema. The SDK will:
 * 1. Convert the schema to JSON Schema for the provider
 * 2. Request JSON output from the provider
 * 3. Parse and validate the response with zod
 *
 * Cancellation: pass `signal` (AbortSignal) and/or `timeoutMs`. Both throw
 * typed errors (OCAISAbortError, OCAISTimeoutError).
 *
 * @example
 * ```ts
 * const { object } = await generateObject({
 *   provider: google({ apiKey }),
 *   model: 'gemini-2.5-flash',
 *   schema: z.object({ name: z.string(), age: z.number() }),
 *   prompt: 'Generate a person',
 * });
 * // object is typed as { name: string; age: number }
 * ```
 */
export declare function generateObject<T>(options: GenerateObjectOptions): Promise<GenerateObjectResult<T>>;
//# sourceMappingURL=generate-object.d.ts.map