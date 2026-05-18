/**
 * @opita/ai-stream — OpenAI-compatible provider
 *
 * Works with: OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible API.
 * Uses native fetch() — zero dependencies.
 */
import type { Provider } from "../types.js";
export interface OpenAIProviderOptions {
    apiKey: string;
    baseURL?: string;
}
export declare function openai(options: OpenAIProviderOptions): Provider;
//# sourceMappingURL=openai-compatible.d.ts.map