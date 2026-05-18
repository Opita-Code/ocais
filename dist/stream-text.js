/**
 * OCAIS — streamText
 *
 * Core streaming function. Calls the provider's streaming API and yields
 * typed StreamChunks. Supports server-side tool execution with multi-step loops.
 */
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
                // System messages from the array are promoted to the system param.
                // If caller already set `system`, this is a secondary system message.
                result.push({ role: "system", content: msg.content });
                break;
            case "user": {
                if (typeof msg.content === "string") {
                    result.push({ role: "user", content: msg.content });
                }
                else {
                    // Multimodal content parts
                    const parts = msg.content.map((part) => {
                        if (part.type === "text")
                            return { type: "text", text: part.text };
                        if (part.type === "image")
                            return { type: "image_url", image_url: { url: part.image } };
                        // File parts: embed as text
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
    const { provider, model, system, messages, tools, temperature, maxTokens, maxSteps = 1, } = options;
    const providerTools = toProviderTools(tools);
    // Check if any tools have server-side execute functions
    const serverTools = tools
        ? Object.entries(tools).filter(([, def]) => def.execute)
        : [];
    const hasServerTools = serverTools.length > 0;
    let currentMessages = [...messages];
    let step = 0;
    while (step < maxSteps) {
        step++;
        const providerMessages = toProviderMessages(system, currentMessages);
        const pendingToolCalls = [];
        for await (const chunk of provider.streamChatCompletion({
            model,
            messages: providerMessages,
            tools: providerTools,
            temperature,
            maxTokens,
        })) {
            // Collect tool calls for potential server-side execution
            if (chunk.type === "tool-call" && hasServerTools) {
                pendingToolCalls.push({
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    args: chunk.args,
                });
            }
            // Always yield chunks to the consumer
            yield chunk;
        }
        // If no server-side tool calls to execute, we're done
        if (pendingToolCalls.length === 0 || !hasServerTools) {
            break;
        }
        // Execute server-side tools and add results to conversation
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
        // Continue loop — provider will see tool results and continue generating
    }
}
//# sourceMappingURL=stream-text.js.map