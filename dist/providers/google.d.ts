/**
 * @opita/ai-stream — Google Gemini provider
 *
 * Uses the Gemini REST API (generativelanguage.googleapis.com).
 * Supports streaming via server-sent events.
 * Zero dependencies — native fetch only.
 */
import type { Provider } from "../types.js";
export interface GoogleProviderOptions {
    apiKey: string;
    baseURL?: string;
}
export declare function google(options: GoogleProviderOptions): Provider;
//# sourceMappingURL=google.d.ts.map