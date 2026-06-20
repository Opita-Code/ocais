/**
 * OCAIS — generateObject
 *
 * Generates a structured JSON object from an AI provider.
 * Uses JSON mode or response_format depending on provider capabilities.
 * Validates output with the provided Zod schema.
 */

import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  ProviderMessage,
  Usage,
} from "./types.js";
import { OCAISAbortError, OCAISTimeoutError } from "./errors.js";

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
export async function generateObject<T>(
  options: GenerateObjectOptions,
): Promise<GenerateObjectResult<T>> {
  const {
    provider,
    model,
    system,
    prompt,
    schema,
    temperature,
    signal: userSignal,
    timeoutMs,
    onStart,
    onComplete,
    onError,
    onAbort,
  } = options;

  const startedAt = Date.now();
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let userHandler: (() => void) | undefined;

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userHandler = () => controller.abort();
      userSignal.addEventListener("abort", userHandler, { once: true });
    }
  }

  if (timeoutMs !== undefined) {
    timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  }

  onStart?.({ model, startedAt });

  try {
    // Build messages
    const messages: ProviderMessage[] = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });

    // Extract JSON schema from Zod
    let jsonSchema: Record<string, unknown>;
    const zodSchema = schema as any;

    if (typeof zodSchema._def?.toJsonSchema === "function") {
      jsonSchema = zodSchema._def.toJsonSchema();
    } else if (typeof zodSchema.toJsonSchema === "function") {
      jsonSchema = zodSchema.toJsonSchema();
    } else {
      try {
        const moduleName = "zod-to-json-schema";
        const mod = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
        if (mod?.zodToJsonSchema) {
          jsonSchema = mod.zodToJsonSchema(zodSchema) as Record<string, unknown>;
        } else {
          jsonSchema = { type: "object" };
        }
      } catch {
        jsonSchema = { type: "object" };
      }
    }

    // Determine response format based on provider
    const isGemini = provider.name === "google-gemini";
    const responseFormat = isGemini
      ? { type: "json_schema" as const, schema: jsonSchema }
      : { type: "json_object" as const };

    // Add schema instruction to the prompt for providers that don't support json_schema natively
    if (!isGemini) {
      const schemaStr = JSON.stringify(jsonSchema, null, 2);
      messages[messages.length - 1].content += `\n\nRespond with a JSON object matching this schema:\n${schemaStr}`;
    }

    const response = await provider.chatCompletion({
      model,
      messages,
      temperature,
      responseFormat,
      signal: controller.signal,
    }).catch((err) => {
      if (controller.signal.aborted) {
        if (userSignal?.aborted) throw new OCAISAbortError();
        if (timeoutMs !== undefined) {
          const elapsedMs = Date.now() - startedAt;
          throw new OCAISTimeoutError(timeoutMs, elapsedMs);
        }
      }
      throw err;
    });

    // Parse the response as JSON
    let parsed: T;
    try {
      const raw = JSON.parse(response.content);

      if (typeof zodSchema.parse === "function") {
        parsed = zodSchema.parse(raw) as T;
      } else {
        parsed = raw as T;
      }
    } catch (err) {
      throw new Error(
        `OCAIS: Failed to parse AI response as structured object: ${err instanceof Error ? err.message : "Unknown error"}. Raw: ${response.content.slice(0, 200)}`,
      );
    }

    const usage: Usage | undefined = response.usage
      ? {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        }
      : undefined;

    onComplete?.({
      model,
      steps: 1,
      durationMs: Date.now() - startedAt,
      usage,
      startedAt,
    });

    return { object: parsed, usage };
  } catch (err) {
    if (controller.signal.aborted) {
      onAbort?.();
      if (userSignal?.aborted) {
        throw new OCAISAbortError();
      }
      if (timeoutMs !== undefined) {
        const elapsedMs = Date.now() - startedAt;
        throw new OCAISTimeoutError(timeoutMs, elapsedMs);
      }
    }
    onError?.({
      error: err instanceof Error ? err : new Error(String(err)),
      step: 1,
      startedAt,
    });
    throw err;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (userHandler && userSignal) {
      userSignal.removeEventListener("abort", userHandler);
    }
  }
}
