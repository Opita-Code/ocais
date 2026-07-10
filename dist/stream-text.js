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
import { OCAISAbortError, OCAISTimeoutError } from "./errors.js";
/**
 * Convert SDK messages to provider-level messages.
 * System messages are separated — the caller handles them via the `system` param.
 */
function toProviderMessages(system, messages) {
    const result = [];
    if (system) {
        result.push({ role: "system", content: system });
    }
    for (const msg of messages) {
        switch (msg.role) {
            case "system":
                result.push({ role: "system", content: msg.content });
                break;
            case "user": {
                if (typeof msg.content === "string") {
                    result.push({ role: "user", content: msg.content });
                }
                else {
                    const parts = msg.content.map((part) => {
                        if (part.type === "text")
                            return { type: "text", text: part.text };
                        if (part.type === "image")
                            return { type: "image_url", image_url: { url: part.image } };
                        return { type: "text", text: `[File: ${part.mediaType}]\n${part.data}` };
                    });
                    result.push({ role: "user", content: parts });
                }
                break;
            }
            case "assistant": {
                const providerMsg = { role: "assistant", content: msg.content };
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    providerMsg.tool_calls = msg.toolCalls.map((tc) => ({
                        id: tc.toolCallId,
                        type: "function",
                        function: {
                            name: tc.toolName,
                            arguments: JSON.stringify(tc.args),
                        },
                    }));
                }
                result.push(providerMsg);
                break;
            }
            case "tool":
                result.push({
                    role: "tool",
                    content: msg.content,
                    tool_call_id: msg.toolCallId,
                });
                break;
        }
    }
    return result;
}
/** Convert SDK tool definitions to provider format */
function toProviderTools(tools) {
    if (!tools || Object.keys(tools).length === 0)
        return undefined;
    return Object.entries(tools).map(([name, def]) => ({
        type: "function",
        function: {
            name,
            description: def.description,
            parameters: def.parameters,
        },
    }));
}
/**
 * Combine user's AbortSignal with an internal timeout-based abort.
 * Both throw the same internal signal when either fires.
 */
function createCombinedSignal(userSignal, timeoutMs) {
    const controller = new AbortController();
    let timeoutHandle;
    let userHandler;
    if (userSignal) {
        if (userSignal.aborted) {
            controller.abort();
        }
        else {
            userHandler = () => controller.abort();
            userSignal.addEventListener("abort", userHandler, { once: true });
        }
    }
    if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout(() => {
            controller.abort();
        }, timeoutMs);
    }
    return {
        signal: controller.signal,
        cleanup: () => {
            if (timeoutHandle !== undefined)
                clearTimeout(timeoutHandle);
            if (userHandler && userSignal) {
                userSignal.removeEventListener("abort", userHandler);
            }
        },
    };
}
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
export async function* streamText(options) {
    const { provider, model, system, messages, tools, temperature, maxTokens, maxSteps = 5, signal: userSignal, timeoutMs, onStart, onComplete, onError, onAbort, } = options;
    const startedAt = Date.now();
    const { signal: combinedSignal, cleanup } = createCombinedSignal(userSignal, timeoutMs);
    onStart?.({
        model,
        toolNames: tools ? Object.keys(tools) : undefined,
        startedAt,
    });
    const providerTools = toProviderTools(tools);
    const serverTools = tools
        ? Object.entries(tools).filter(([, def]) => def.execute)
        : [];
    const hasServerTools = serverTools.length > 0;
    let currentMessages = [...messages];
    let step = 0;
    let totalUsage;
    let aborted = false;
    try {
        while (step < maxSteps) {
            step++;
            if (combinedSignal.aborted) {
                aborted = true;
                break;
            }
            const providerMessages = toProviderMessages(system, currentMessages);
            const pendingToolCalls = [];
            try {
                for await (const chunk of provider.streamChatCompletion({
                    model,
                    messages: providerMessages,
                    tools: providerTools,
                    temperature,
                    maxTokens,
                    signal: combinedSignal,
                })) {
                    if (combinedSignal.aborted) {
                        aborted = true;
                        break;
                    }
                    if (chunk.type === "usage") {
                        totalUsage = {
                            promptTokens: chunk.promptTokens,
                            completionTokens: chunk.completionTokens,
                            totalTokens: chunk.totalTokens,
                        };
                    }
                    if (chunk.type === "tool-call" && hasServerTools) {
                        pendingToolCalls.push({
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName,
                            args: chunk.args,
                        });
                    }
                    yield chunk;
                }
            }
            catch (err) {
                if (combinedSignal.aborted) {
                    aborted = true;
                    break;
                }
                throw err;
            }
            if (pendingToolCalls.length === 0 || !hasServerTools) {
                break;
            }
            // Execute server-side tools
            const assistantMsg = {
                role: "assistant",
                content: "",
                toolCalls: pendingToolCalls,
            };
            currentMessages.push(assistantMsg);
            for (const tc of pendingToolCalls) {
                const toolDef = tools?.[tc.toolName];
                if (toolDef?.execute) {
                    try {
                        const result = await toolDef.execute(tc.args);
                        const resultMsg = {
                            role: "tool",
                            toolCallId: tc.toolCallId,
                            content: JSON.stringify(result),
                        };
                        currentMessages.push(resultMsg);
                        yield {
                            type: "tool-result",
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            result,
                        };
                    }
                    catch (err) {
                        const errorMsg = err instanceof Error ? err.message : "Tool execution failed";
                        currentMessages.push({
                            role: "tool",
                            toolCallId: tc.toolCallId,
                            content: JSON.stringify({ error: errorMsg }),
                        });
                        yield {
                            type: "tool-result",
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            result: { error: errorMsg },
                        };
                    }
                }
            }
        }
        if (aborted) {
            onAbort?.();
            if (userSignal?.aborted) {
                throw new OCAISAbortError();
            }
            if (timeoutMs !== undefined) {
                const elapsedMs = Date.now() - startedAt;
                throw new OCAISTimeoutError(timeoutMs, elapsedMs);
            }
        }
        onComplete?.({
            model,
            steps: step,
            durationMs: Date.now() - startedAt,
            usage: totalUsage,
            startedAt,
        });
    }
    catch (err) {
        onError?.({
            error: err instanceof Error ? err : new Error(String(err)),
            step,
            startedAt,
        });
        throw err;
    }
    finally {
        cleanup();
    }
}
//# sourceMappingURL=stream-text.js.map