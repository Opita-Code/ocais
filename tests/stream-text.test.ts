/**
 * OCAIS — streamText tests
 *
 * Uses node:test + fetch mocking. No external API calls.
 */

import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { streamText, OCAISAbortError, OCAISTimeoutError } from "../dist/index.js";
import { openai } from "../dist/providers/openai-compatible.js";

/**
 * Mock fetch that returns a streaming SSE response with the given chunks.
 */
function mockStreamingFetch(chunks: string[]): typeof fetch {
  return async (_input, _init) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
}

/**
 * Mock fetch that returns a non-streaming JSON response.
 */
function mockJsonFetch(content: string, usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }): typeof fetch {
  return async (_input, _init) => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content, role: "assistant" }, finish_reason: "stop" }],
        usage,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

describe("streamText: basic", () => {
  test("yields text chunks from streaming response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockStreamingFetch([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]) as typeof fetch;

    try {
      const chunks: string[] = [];
      for await (const chunk of streamText({
        provider: openai({ apiKey: "test" }),
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      })) {
        if (chunk.type === "text") chunks.push(chunk.text);
      }
      assert.deepEqual(chunks, ["Hello", " world"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("yields usage chunk when provider reports it", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockStreamingFetch([
      'data: {"choices":[{"delta":{"content":"x"}}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n\n',
      'data: [DONE]\n\n',
    ]) as typeof fetch;

    try {
      let usage: any = null;
      for await (const chunk of streamText({
        provider: openai({ apiKey: "test" }),
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      })) {
        if (chunk.type === "usage") usage = chunk;
      }
      assert.equal(usage?.promptTokens, 5);
      assert.equal(usage?.completionTokens, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("streamText: server-side tools", () => {
  test("executes tool and continues the loop", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async (_input: any, _init: any) => {
      callCount++;
      // First call: model returns a tool call (SSE format)
      // Second call: model returns final text (SSE format)
      if (callCount === 1) {
        const body = JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "getTime", arguments: "{}" },
              }],
            },
            finish_reason: "tool_calls",
          }],
        });
        return new Response(
          `data: ${body}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }
      const body = JSON.stringify({
        choices: [{
          delta: { content: "It's 3pm" },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      });
      return new Response(
        `data: ${body}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    try {
      const toolExecute = mock.fn(async () => "3:00 PM");
      const texts: string[] = [];
      const toolResults: any[] = [];

      for await (const chunk of streamText({
        provider: openai({ apiKey: "test" }),
        model: "test-model",
        messages: [{ role: "user", content: "What time is it?" }],
        tools: {
          getTime: {
            description: "Get current time",
            parameters: { type: "object", properties: {} },
            execute: toolExecute,
          },
        },
        maxSteps: 3,
      })) {
        if (chunk.type === "text") texts.push(chunk.text);
        if (chunk.type === "tool-result") toolResults.push(chunk);
      }

      assert.equal(toolExecute.mock.calls.length, 1);
      assert.equal(texts.join(""), "It's 3pm");
      assert.equal(toolResults.length, 1);
      assert.equal(toolResults[0].result, "3:00 PM");
      assert.equal(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("stops at maxSteps even if tool calls continue", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      // Always returns a tool call, never returns text (SSE format)
      const body = JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call_x",
              type: "function",
              function: { name: "loop", arguments: "{}" },
            }],
          },
          finish_reason: "tool_calls",
        }],
      });
      return new Response(
        `data: ${body}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    try {
      const iterations: number[] = [];
      for await (const chunk of streamText({
        provider: openai({ apiKey: "test" }),
        model: "test-model",
        messages: [{ role: "user", content: "loop" }],
        tools: {
          loop: {
            description: "loop",
            parameters: { type: "object" },
            execute: async () => {
              iterations.push(1);
              return "ok";
            },
          },
        },
        maxSteps: 3,
      })) {
        // consume
      }
      assert.equal(iterations.length, 3, "should stop at maxSteps");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("streamText: cancellation", () => {
  test("throws OCAISAbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockStreamingFetch([]) as typeof fetch;

    try {
      await assert.rejects(
        (async () => {
          for await (const _ of streamText({
            provider: openai({ apiKey: "test" }),
            model: "test-model",
            messages: [{ role: "user", content: "Hi" }],
            signal: controller.signal,
          })) {
            // consume
          }
        })(),
        (err: unknown) => err instanceof OCAISAbortError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws OCAISTimeoutError when timeoutMs is exceeded", async () => {
    const originalFetch = globalThis.fetch;
    // Mock fetch that respects signal and waits forever
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
        // Never resolves naturally
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        (async () => {
          for await (const _ of streamText({
            provider: openai({ apiKey: "test" }),
            model: "test-model",
            messages: [{ role: "user", content: "Hi" }],
            timeoutMs: 50,
          })) {
            // consume
          }
        })(),
        (err: unknown) => err instanceof OCAISTimeoutError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("streamText: observability hooks", () => {
  test("calls onStart and onComplete with correct context", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockStreamingFetch([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: [DONE]\n\n',
    ]) as typeof fetch;

    try {
      let startContext: any = null;
      let completeContext: any = null;

      for await (const _ of streamText({
        provider: openai({ apiKey: "test" }),
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
        onStart: (ctx) => { startContext = ctx; },
        onComplete: (ctx) => { completeContext = ctx; },
      })) {
        // consume
      }

      assert.equal(startContext?.model, "test-model");
      assert.equal(typeof startContext?.startedAt, "number");
      assert.equal(completeContext?.steps, 1);
      assert.equal(completeContext?.model, "test-model");
      assert.ok(completeContext?.durationMs >= 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("calls onError when fetch throws", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    try {
      let errorContext: any = null;
      await assert.rejects(
        (async () => {
          for await (const _ of streamText({
            provider: openai({ apiKey: "test" }),
            model: "test-model",
            messages: [{ role: "user", content: "Hi" }],
            onError: (ctx) => { errorContext = ctx; },
          })) {
            // consume
          }
        })(),
      );
      assert.ok(errorContext?.error instanceof Error);
      assert.equal(errorContext?.error.message, "network down");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
