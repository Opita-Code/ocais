/**
 * OCAIS — generateObject tests
 */

import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { generateObject, OCAISAbortError, OCAISTimeoutError } from "../dist/index.js";
import { openai } from "../dist/providers/openai-compatible.js";
import { z } from "zod";

function mockJsonFetch(content: string): typeof fetch {
  return async (_input, _init) => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content, role: "assistant" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

describe("generateObject: basic", () => {
  test("parses JSON and validates with Zod schema", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockJsonFetch('{"name":"Alice","age":30}') as typeof fetch;

    try {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = await generateObject({
        provider: openai({ apiKey: "test" }),
        model: "test-model",
        schema,
        prompt: "Generate a person",
      });
      assert.equal(result.object.name, "Alice");
      assert.equal(result.object.age, 30);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws on malformed JSON", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockJsonFetch("not json at all") as typeof fetch;

    try {
      await assert.rejects(
        generateObject({
          provider: openai({ apiKey: "test" }),
          model: "test-model",
          schema: z.object({ name: z.string() }),
          prompt: "Generate",
        }),
        /Failed to parse/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("generateObject: cancellation", () => {
  test("throws OCAISAbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const originalFetch = globalThis.fetch;
    // Mock fetch that respects the already-aborted signal
    globalThis.fetch = (async (_input: any, init?: any) => {
      if (init?.signal?.aborted) {
        throw new Error("aborted");
      }
      return new Response('{"x":1}', { status: 200 });
    }) as typeof fetch;

    try {
      await assert.rejects(
        generateObject({
          provider: openai({ apiKey: "test" }),
          model: "test-model",
          schema: z.object({ x: z.number() }),
          prompt: "Generate",
          signal: controller.signal,
        }),
        (err: unknown) => err instanceof OCAISAbortError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws OCAISTimeoutError when timeoutMs is exceeded", async () => {
    const originalFetch = globalThis.fetch;
    // Mock fetch that respects signal and never resolves naturally
    globalThis.fetch = (async (_input: any, init?: any) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        if (signal) {
          if (signal.aborted) {
            reject(new Error("aborted"));
            return;
          }
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }
        // never resolves
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        generateObject({
          provider: openai({ apiKey: "test" }),
          model: "test-model",
          schema: z.object({ x: z.number() }),
          prompt: "Generate",
          timeoutMs: 50,
        }),
        (err: unknown) => err instanceof OCAISTimeoutError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
