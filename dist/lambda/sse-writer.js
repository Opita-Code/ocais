/**
 * OCAIS — Lambda SSE Writer
 *
 * Helper for writing Server-Sent Events to AWS Lambda response streams.
 * Works with awslambda.streamifyResponse().
 */
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
export function createSSEWriter(stream) {
    if (stream.setContentType) {
        stream.setContentType("text/event-stream");
    }
    return {
        write(chunk) {
            switch (chunk.type) {
                case "text":
                    stream.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
                    break;
                case "reasoning":
                    stream.write(`data: ${JSON.stringify({ type: "reasoning", content: chunk.text })}\n\n`);
                    break;
                case "tool-call":
                    stream.write(`data: ${JSON.stringify({
                        type: "mcp_tool_request",
                        tool: chunk.toolName,
                        toolCallId: chunk.toolCallId,
                        args: chunk.args,
                    })}\n\n`);
                    break;
                case "tool-result":
                    stream.write(`data: ${JSON.stringify({
                        type: "tool_result",
                        tool: chunk.toolName,
                        result: chunk.result,
                    })}\n\n`);
                    break;
                case "usage":
                    // Usage is typically not forwarded to the client, but we support it
                    stream.write(`data: ${JSON.stringify({
                        type: "usage",
                        promptTokens: chunk.promptTokens,
                        completionTokens: chunk.completionTokens,
                        totalTokens: chunk.totalTokens,
                    })}\n\n`);
                    break;
                case "error":
                    stream.write(`data: ${JSON.stringify({ content: `\n\n⛔ **Error:** ${chunk.error}` })}\n\n`);
                    break;
                case "done":
                    // The done chunk is handled by the done() method
                    break;
            }
        },
        writeRaw(data) {
            stream.write(`data: ${data}\n\n`);
        },
        done() {
            stream.write("data: [DONE]\n\n");
            stream.end();
        },
    };
}
//# sourceMappingURL=sse-writer.js.map