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
} from "./types.js";

/**
 * Generate a structured object from an AI provider.
 *
 * The schema should be a Zod schema. The SDK will:
 * 1. Convert the schema to JSON Schema for the provider
 * 2. Request JSON output from the provider
 * 3. Parse and validate the response with zod
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
  const { provider, model, system, prompt, schema, temperature } = options;

  // Build messages
  const messages: ProviderMessage[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({
    role: "user",
    content: prompt,
  });

  // Extract JSON schema from Zod
  // Zod v4 has .toJSONSchema(), Zod v3 needs zod-to-json-schema
  let jsonSchema: Record<string, unknown>;
  const zodSchema = schema as any;

  if (typeof zodSchema._def?.toJsonSchema === "function") {
    jsonSchema = zodSchema._def.toJsonSchema();
  } else if (typeof zodSchema.toJsonSchema === "function") {
    jsonSchema = zodSchema.toJsonSchema();
  } else {
    // Fallback: try to use the schema shape to build a rough JSON schema
    // This works with basic Zod schemas
    try {
      // Dynamically import zod-to-json-schema if available
      const moduleName = "zod-to-json-schema";
      const mod = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
      if (mod?.zodToJsonSchema) {
        jsonSchema = mod.zodToJsonSchema(zodSchema) as Record<string, unknown>;
      } else {
        // Last resort: ask the model to return JSON without strict schema
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
  });

  // Parse the response as JSON
  let parsed: T;
  try {
    const raw = JSON.parse(response.content);

    // Validate with Zod if available
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

  return {
    object: parsed,
    usage: response.usage,
  };
}
