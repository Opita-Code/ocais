/**
 * OCAIS — Lambda SSE Writer
 *
 * Helper for writing Server-Sent Events to AWS Lambda response streams.
 * Works with awslambda.streamifyResponse().
 */
import type { StreamChunk } from "../types.js";
export interface SSEWritableStream {
    write(data: string | Uint8Array): void;
    end(): void;
    setContentType?(type: string): void;
}
export interface SSEWriter {
    /** Write a StreamChunk as an SSE event */
    write(chunk: StreamChunk): void;
    /** Write a raw string as an SSE data event */
    writeRaw(data: string): void;
    /** Send data: [DONE] and end the stream */
    done(): void;
}
/**
 * Create an SSE writer that formats StreamChunks into SSE events
 * for AWS Lambda response streaming.
 *
 * @example
 * ```ts
 * export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
 *   responseStream.setContentType('text/event-stream');
 *
 *   const writer = createSSEWriter(responseStream);
 *   const stream = streamText({ ... });
 *
 *   for await (const chunk of stream) {
 *     writer.write(chunk);
 *   }
 *   writer.done();
 * });
 * ```
 */
export declare function createSSEWriter(stream: SSEWritableStream): SSEWriter;
//# sourceMappingURL=sse-writer.d.ts.map