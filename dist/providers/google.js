/**
 * @opita/ai-stream — Google Gemini provider
 *
 * Uses the Gemini REST API (generativelanguage.googleapis.com).
 * Supports streaming via server-sent events.
 * Zero dependencies — native fetch only.
 */
/** Convert OpenAI-style messages to Gemini format */
function toGeminiMessages(messages) {
    let systemInstruction;
    const contents = [];
    for (const msg of messages) {
        if (msg.role === "system") {
            // Gemini uses systemInstruction, not a system role in contents
            systemInstruction = { parts: [{ text: typeof msg.content === "string" ? msg.content : "" }] };
            continue;
        }
        const role = msg.role === "assistant" ? "model" : "user";
        const text = typeof msg.content === "string" ? msg.content : "";
        contents.push({ role, parts: [{ text }] });
    }
    return { systemInstruction, contents };
}
/** Convert tool definitions to Gemini format */
function toGeminiTools(tools) {
    if (!tools || tools.length === 0)
        return undefined;
    const functionDeclarations = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
    }));
    return [{ functionDeclarations }];
}
export function google(options) {
    const { apiKey, baseURL = "https://generativelanguage.googleapis.com/v1beta" } = options;
    const base = baseURL.replace(/\/+$/, "");
    return {
        name: "google-gemini",
        async *streamChatCompletion(req) {
            const { systemInstruction, contents } = toGeminiMessages(req.messages);
            const body = { contents };
            if (systemInstruction)
                body.systemInstruction = systemInstruction;
            const geminiTools = toGeminiTools(req.tools);
            if (geminiTools)
                body.tools = geminiTools;
            if (req.temperature !== undefined) {
                body.generationConfig = { ...(body.generationConfig || {}), temperature: req.temperature };
            }
            if (req.maxTokens !== undefined) {
                body.generationConfig = { ...(body.generationConfig || {}), maxOutputTokens: req.maxTokens };
            }
            if (req.responseFormat?.type === "json_object") {
                body.generationConfig = { ...(body.generationConfig || {}), responseMimeType: "application/json" };
            }
            if (req.responseFormat?.type === "json_schema" && req.responseFormat.schema) {
                body.generationConfig = {
                    ...(body.generationConfig || {}),
                    responseMimeType: "application/json",
                    responseSchema: req.responseFormat.schema,
                };
            }
            const url = `${base}/models/${req.model}:streamGenerateContent?key=${apiKey}&alt=sse`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                yield { type: "error", error: `Gemini ${response.status}: ${errorText}` };
                return;
            }
            if (!response.body) {
                yield { type: "error", error: "No response body" };
                return;
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith("data: "))
                            continue;
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const candidate = json.candidates?.[0];
                            if (!candidate?.content?.parts)
                                continue;
                            for (const part of candidate.content.parts) {
                                if (part.text !== undefined) {
                                    yield { type: "text", text: part.text };
                                }
                                if (part.functionCall) {
                                    yield {
                                        type: "tool-call",
                                        toolCallId: `call-${Date.now()}-${part.functionCall.name}`,
                                        toolName: part.functionCall.name,
                                        args: part.functionCall.args || {},
                                    };
                                }
                            }
                            // Usage metadata
                            if (json.usageMetadata) {
                                yield {
                                    type: "usage",
                                    promptTokens: json.usageMetadata.promptTokenCount || 0,
                                    completionTokens: json.usageMetadata.candidatesTokenCount || 0,
                                    totalTokens: json.usageMetadata.totalTokenCount || 0,
                                };
                            }
                        }
                        catch {
                            // Skip malformed chunks
                        }
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
            yield { type: "done" };
        },
        async chatCompletion(req) {
            const { systemInstruction, contents } = toGeminiMessages(req.messages);
            const body = { contents };
            if (systemInstruction)
                body.systemInstruction = systemInstruction;
            const geminiTools = toGeminiTools(req.tools);
            if (geminiTools)
                body.tools = geminiTools;
            if (req.temperature !== undefined) {
                body.generationConfig = { ...(body.generationConfig || {}), temperature: req.temperature };
            }
            if (req.maxTokens !== undefined) {
                body.generationConfig = { ...(body.generationConfig || {}), maxOutputTokens: req.maxTokens };
            }
            if (req.responseFormat?.type === "json_object") {
                body.generationConfig = { ...(body.generationConfig || {}), responseMimeType: "application/json" };
            }
            if (req.responseFormat?.type === "json_schema" && req.responseFormat.schema) {
                body.generationConfig = {
                    ...(body.generationConfig || {}),
                    responseMimeType: "application/json",
                    responseSchema: req.responseFormat.schema,
                };
            }
            const url = `${base}/models/${req.model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "Unknown error");
                throw new Error(`Gemini API error ${response.status}: ${errorText}`);
            }
            const json = await response.json();
            const candidate = json.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            let content = "";
            const toolCalls = [];
            for (const part of parts) {
                if (part.text)
                    content += part.text;
                if (part.functionCall) {
                    toolCalls.push({
                        toolCallId: `call-${Date.now()}-${part.functionCall.name}`,
                        toolName: part.functionCall.name,
                        args: part.functionCall.args || {},
                    });
                }
            }
            return {
                content,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                usage: json.usageMetadata
                    ? {
                        promptTokens: json.usageMetadata.promptTokenCount || 0,
                        completionTokens: json.usageMetadata.candidatesTokenCount || 0,
                        totalTokens: json.usageMetadata.totalTokenCount || 0,
                    }
                    : undefined,
                finishReason: candidate?.finishReason,
            };
        },
    };
}
//# sourceMappingURL=google.js.map