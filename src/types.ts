/**
 * @opita/ai-stream — Type definitions
 *
 * All public types for the SDK. Designed to be simple, predictable,
 * and free of the magic conversions that plague larger SDKs.
 */

// ─── Messages ───────────────────────────────────────────────────

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

// ─── Content Parts (multimodal) ─────────────────────────────────

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mediaType?: string }
  | { type: "file"; data: string; mediaType: string };

// ─── Tools ──────────────────────────────────────────────────────

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

// ─── Stream Chunks ──────────────────────────────────────────────

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "usage"; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: "error"; error: string }
  | { type: "done" };

// ─── Provider Interface ─────────────────────────────────────────

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
  responseFormat?: { type: "json_object" | "json_schema"; schema?: unknown };
  /**
   * AbortSignal to cancel the in-flight HTTP request. Standard web API.
   * Providers should pass this to `fetch()`.
   */
  signal?: AbortSignal;
}

/** Provider-level message format (OpenAI-compatible) */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ProviderContentPart[] | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ProviderContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: string };
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
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason?: string;
}

// ─── Public API Options ─────────────────────────────────────────

export interface StreamTextOptions {
  provider: Provider;
  model: string;
  system?: string;
  messages: Message[];
  tools?: Record<string, ToolDefinition>;
  temperature?: number;
  maxTokens?: number;
  /**
   * Max tool execution rounds (for server-side tools). Default: 5
   * The loop runs while `step < maxSteps` AND there are pending tool calls
   * with `execute` functions.
   */
  maxSteps?: number;
  /**
   * AbortSignal to cancel the operation. When aborted, throws OCAISAbortError.
   * Standard web API — works with any AbortController.
   */
  signal?: AbortSignal;
  /**
   * Timeout in milliseconds. When exceeded, throws OCAISTimeoutError.
   * Implemented internally via AbortController — does not conflict with `signal`.
   */
  timeoutMs?: number;
  /**
   * Observability hooks. Called at key lifecycle points. All hooks are optional.
   * For a richer event-based API, see `streamTextWithEvents`.
   */
  onStart?: (ctx: StartContext) => void;
  onComplete?: (ctx: CompleteContext) => void;
  onError?: (ctx: ErrorContext) => void;
  onAbort?: () => void;
}

export interface GenerateObjectOptions {
  provider: Provider;
  model: string;
  system?: string;
  prompt: string;
  schema: unknown; // Zod schema — we call .parse() on the result
  temperature?: number;
  /**
   * AbortSignal to cancel the operation. When aborted, throws OCAISAbortError.
   */
  signal?: AbortSignal;
  /**
   * Timeout in milliseconds. When exceeded, throws OCAISTimeoutError.
   */
  timeoutMs?: number;
  onStart?: (ctx: StartContext) => void;
  onComplete?: (ctx: CompleteContext) => void;
  onError?: (ctx: ErrorContext) => void;
  onAbort?: () => void;
}

// ─── Observability Contexts ──────────────────────────────────────

export interface StartContext {
  model: string;
  /** Names of tools available, if any. */
  toolNames?: string[];
  /** Request timestamp (ms since epoch). */
  startedAt: number;
}

export interface CompleteContext {
  model: string;
  /** Number of LLM round-trips performed. */
  steps: number;
  /** Total elapsed milliseconds. */
  durationMs: number;
  /** Total token usage (if reported by provider). */
  usage?: Usage;
  /** Request timestamp (ms since epoch). */
  startedAt: number;
}

export interface ErrorContext {
  error: Error;
  step: number;
  /** Request timestamp (ms since epoch). */
  startedAt: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateObjectResult<T = unknown> {
  object: T;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}
