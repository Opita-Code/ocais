/**
 * @opita/ai-stream — OpenAI-compatible provider
 *
 * Works with: OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible API.
 * Uses native fetch() — zero dependencies.
 */

import type {
  Provider,
  ProviderRequest,
  ProviderResponse,
  StreamChunk,
} from "../types.js";

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
}

export function openai(options: OpenAIProviderOptions): Provider {
  const { apiKey, baseURL = "https://api.openai.com/v1" } = options;
  // Normalize: remove trailing slash
  const base = baseURL.replace(/\/+$/, "");

  return {
    name: "openai-compatible",

    async *streamChatCompletion(req: ProviderRequest): AsyncIterable<StreamChunk> {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
        stream: true,
        stream_options: { include_usage: true },
      };

      if (req.tools && req.tools.length > 0) {
        body.tools = req.tools;
      }
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
      if (req.responseFormat) body.response_format = req.responseFormat;

      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        yield { type: "error", error: `${response.status}: ${errorText}` };
        return;
      }

      if (!response.body) {
        yield { type: "error", error: "No response body" };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Accumulate tool calls across chunks (OpenAI sends them incrementally)
      const toolCallAccumulator: Map<number, { id: string; name: string; args: string }> = new Map();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const choice = json.choices?.[0];

              if (!choice) {
                // Usage-only chunk (sent at end with stream_options.include_usage)
                if (json.usage) {
                  yield {
                    type: "usage",
                    promptTokens: json.usage.prompt_tokens || 0,
                    completionTokens: json.usage.completion_tokens || 0,
                    totalTokens: json.usage.total_tokens || 0,
                  };
                }
                continue;
              }

              const delta = choice.delta;
              if (!delta) continue;

              // Text content
              if (delta.content) {
                yield { type: "text", text: delta.content };
              }

              // Reasoning (DeepSeek-specific)
              if (delta.reasoning_content) {
                yield { type: "reasoning", text: delta.reasoning_content };
              }

              // Tool calls (accumulated incrementally)
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCallAccumulator.has(idx)) {
                    toolCallAccumulator.set(idx, {
                      id: tc.id || `call-${Date.now()}-${idx}`,
                      name: tc.function?.name || "",
                      args: "",
                    });
                  }
                  const acc = toolCallAccumulator.get(idx)!;
                  if (tc.id) acc.id = tc.id;
                  if (tc.function?.name) acc.name = tc.function.name;
                  if (tc.function?.arguments) acc.args += tc.function.arguments;
                }
              }

              // Finish reason — emit accumulated tool calls
              if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
                for (const [, tc] of toolCallAccumulator) {
                  let args: Record<string, unknown> = {};
                  try {
                    args = JSON.parse(tc.args || "{}");
                  } catch {
                    args = { _raw: tc.args };
                  }
                  yield {
                    type: "tool-call",
                    toolCallId: tc.id,
                    toolName: tc.name,
                    args,
                  };
                }
                toolCallAccumulator.clear();
              }

              // Usage in choice (some providers)
              if (json.usage) {
                yield {
                  type: "usage",
                  promptTokens: json.usage.prompt_tokens || 0,
                  completionTokens: json.usage.completion_tokens || 0,
                  totalTokens: json.usage.total_tokens || 0,
                };
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      yield { type: "done" };
    },

    async chatCompletion(req: ProviderRequest): Promise<ProviderResponse> {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
        stream: false,
      };

      if (req.tools && req.tools.length > 0) body.tools = req.tools;
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
      if (req.responseFormat) body.response_format = req.responseFormat;

      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const choice = json.choices?.[0];
      const message = choice?.message;

      const toolCalls = message?.tool_calls?.map((tc: any) => ({
        toolCallId: tc.id,
        toolName: tc.function.name,
        args: JSON.parse(tc.function.arguments || "{}"),
      }));

      return {
        content: message?.content || "",
        toolCalls,
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens || 0,
              completionTokens: json.usage.completion_tokens || 0,
              totalTokens: json.usage.total_tokens || 0,
            }
          : undefined,
        finishReason: choice?.finish_reason,
      };
    },
  };
}
