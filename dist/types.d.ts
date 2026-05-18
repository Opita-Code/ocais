/**
 * @opita/ai-stream — Type definitions
 *
 * All public types for the SDK. Designed to be simple, predictable,
 * and free of the magic conversions that plague larger SDKs.
 */
export interface SystemMessage {
    role: "system";
    content: string;
}
export interface UserMessage {
    role: "user";
    content: string | ContentPart[];
}
export interface AssistantMessage {
    role: "assistant";
    content: string;
    toolCalls?: ToolCall[];
}
export interface ToolResultMessage {
    role: "tool";
    toolCallId: string;
    content: string;
}
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;
export type ContentPart = {
    type: "text";
    text: string;
} | {
    type: "image";
    image: string;
    mediaType?: string;
} | {
    type: "file";
    data: string;
    mediaType: string;
};
export interface ToolDefinition {
    description: string;
    parameters: JsonSchema;
    /** If provided, tool executes server-side. If omitted, tool call is forwarded to client. */
    execute?: (args: Record<string, unknown>) => Promise<unknown>;
}
export interface JsonSchema {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
}
export interface ToolCall {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
}
export type StreamChunk = {
    type: "text";
    text: string;
} | {
    type: "reasoning";
    text: string;
} | {
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
} | {
    type: "tool-result";
    toolCallId: string;
    toolName: string;
    result: unknown;
} | {
    type: "usage";
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
} | {
    type: "error";
    error: string;
} | {
    type: "done";
};
/**
 * A provider encapsulates how to call a specific AI API.
 * Providers are stateless — they only hold config (apiKey, baseURL).
 */
export interface Provider {
    readonly name: string;
    /**
     * Streams a chat completion. Returns an async iterable of raw SSE lines.
     * The caller (streamText/generateObject) parses these into StreamChunks.
     */
    streamChatCompletion(options: ProviderRequest): AsyncIterable<StreamChunk>;
    /**
     * Non-streaming chat completion. Used by generateObject.
     */
    chatCompletion(options: ProviderRequest): Promise<ProviderResponse>;
}
export interface ProviderRequest {
    model: string;
    messages: ProviderMessage[];
    tools?: ProviderTool[];
    temperature?: number;
    maxTokens?: number;
    responseFormat?: {
        type: "json_object" | "json_schema";
        schema?: unknown;
    };
}
/** Provider-level message format (OpenAI-compatible) */
export interface ProviderMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | ProviderContentPart[] | null;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
    tool_call_id?: string;
}
export interface ProviderContentPart {
    type: "text" | "image_url";
    text?: string;
    image_url?: {
        url: string;
        detail?: string;
    };
}
export interface ProviderTool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: JsonSchema;
    };
}
export interface ProviderResponse {
    content: string;
    toolCalls?: ToolCall[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason?: string;
}
export interface StreamTextOptions {
    provider: Provider;
    model: string;
    system?: string;
    messages: Message[];
    tools?: Record<string, ToolDefinition>;
    temperature?: number;
    maxTokens?: number;
    /** Max tool execution rounds (for server-side tools). Default: 1 */
    maxSteps?: number;
}
export interface GenerateObjectOptions {
    provider: Provider;
    model: string;
    system?: string;
    prompt: string;
    schema: unknown;
    temperature?: number;
}
export interface GenerateObjectResult<T = unknown> {
    object: T;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
//# sourceMappingURL=types.d.ts.map