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
export function createSSEWriter(stream: SSEWritableStream): SSEWriter {
  if (stream.setContentType) {
    stream.setContentType("text/event-stream");
  }

  return {
    write(chunk: StreamChunk) {
      switch (chunk.type) {
        case "text":
          stream.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
          break;

        case "reasoning":
          stream.write(`data: ${JSON.stringify({ type: "reasoning", content: chunk.text })}\n\n`);
          break;

        case "tool-call":
          stream.write(
            `data: ${JSON.stringify({
              type: "mcp_tool_request",
              tool: chunk.toolName,
              toolCallId: chunk.toolCallId,
              args: chunk.args,
            })}\n\n`,
          );
          break;

        case "tool-result":
          stream.write(
            `data: ${JSON.stringify({
              type: "tool_result",
              tool: chunk.toolName,
              result: chunk.result,
            })}\n\n`,
          );
          break;

        case "usage":
          // Usage is typically not forwarded to the client, but we support it
          stream.write(
            `data: ${JSON.stringify({
              type: "usage",
              promptTokens: chunk.promptTokens,
              completionTokens: chunk.completionTokens,
              totalTokens: chunk.totalTokens,
            })}\n\n`,
          );
          break;

        case "error":
          stream.write(
            `data: ${JSON.stringify({ content: `\n\n⛔ **Error:** ${chunk.error}` })}\n\n`,
          );
          break;

        case "done":
          // The done chunk is handled by the done() method
          break;
      }
    },

    writeRaw(data: string) {
      stream.write(`data: ${data}\n\n`);
    },

    done() {
      stream.write("data: [DONE]\n\n");
      stream.end();
    },
  };
}
