/**
 * OCAIS — Error types
 *
 * Typed errors for predictable error handling. Consumers can use
 * `instanceof` checks to handle specific failure modes.
 */
/**
 * Base error for all OCAIS failures.
 * Subclasses set their own `name` (e.g. "OCAISAbortError") for instanceof debugging.
 */
export declare class OCAISError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Thrown when the operation is aborted via AbortSignal.
 */
export declare class OCAISAbortError extends OCAISError {
    constructor(message?: string);
}
/**
 * Thrown when an operation exceeds its timeoutMs budget.
 */
export declare class OCAISTimeoutError extends OCAISError {
    readonly timeoutMs: number;
    readonly elapsedMs: number;
    constructor(timeoutMs: number, elapsedMs: number);
}
/**
 * Thrown when a provider returns malformed data (SSE parse error, invalid JSON, etc.).
 */
export declare class OCAISParseError extends OCAISError {
    readonly raw?: string;
    constructor(message: string, raw?: string);
}
/**
 * Thrown when a tool execution fails.
 */
export declare class OCAISToolError extends OCAISError {
    readonly toolName: string;
    readonly toolCallId: string;
    constructor(toolName: string, toolCallId: string, message: string);
}
/**
 * Thrown when a provider returns a non-2xx HTTP status.
 */
export declare class OCAISProviderError extends OCAISError {
    readonly status: number;
    readonly provider: string;
    constructor(provider: string, status: number, body?: string);
}
//# sourceMappingURL=errors.d.ts.map