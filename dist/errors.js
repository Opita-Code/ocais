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
export class OCAISError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = new.target.name;
    }
}
/**
 * Thrown when the operation is aborted via AbortSignal.
 */
export class OCAISAbortError extends OCAISError {
    constructor(message = "OCAIS: operation was aborted") {
        super(message);
    }
}
/**
 * Thrown when an operation exceeds its timeoutMs budget.
 */
export class OCAISTimeoutError extends OCAISError {
    timeoutMs;
    elapsedMs;
    constructor(timeoutMs, elapsedMs) {
        super(`OCAIS: operation timed out after ${elapsedMs}ms (limit: ${timeoutMs}ms)`);
        this.timeoutMs = timeoutMs;
        this.elapsedMs = elapsedMs;
    }
}
/**
 * Thrown when a provider returns malformed data (SSE parse error, invalid JSON, etc.).
 */
export class OCAISParseError extends OCAISError {
    raw;
    constructor(message, raw) {
        super(message);
        this.raw = raw;
    }
}
/**
 * Thrown when a tool execution fails.
 */
export class OCAISToolError extends OCAISError {
    toolName;
    toolCallId;
    constructor(toolName, toolCallId, message) {
        super(`OCAIS: tool "${toolName}" failed: ${message}`);
        this.toolName = toolName;
        this.toolCallId = toolCallId;
    }
}
/**
 * Thrown when a provider returns a non-2xx HTTP status.
 */
export class OCAISProviderError extends OCAISError {
    status;
    provider;
    constructor(provider, status, body) {
        super(`OCAIS: provider "${provider}" returned ${status}${body ? `: ${body.slice(0, 200)}` : ""}`);
        this.status = status;
        this.provider = provider;
    }
}
//# sourceMappingURL=errors.js.map