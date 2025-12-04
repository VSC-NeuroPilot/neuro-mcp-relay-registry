import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Raw result from other MCP server that can be either new format (protocol 2025-v3):
 * {
 *   content: ContentBlock[],
 *   isError?:
 *   boolean,
 *   ...
 * }
 * or legacy () format (protocol 2024-10-07): { toolResult: unknown, ... }
 */
export type RawCallToolResult =
    | CallToolResult
    | (Partial<CallToolResult> & { toolResult: unknown })
    | Record<string, unknown>;

/**
 * Result of a tool execution. The `result` field uses new CallToolResult format from MCP protocol 2025-v3
 */
export interface McpToolCallResult {
    success: boolean;
    result: CallToolResult;
}

/**
 * Normalizes a raw MCP call tool result to `CallToolResult` format from `@modelcontextprotocol/sdk/types.js`.
 * Handles both the new format (with content) and legacy format (with toolResult).
 */
export function normalizeCallToolResult(rawResult: RawCallToolResult): CallToolResult {
    // If it has toolResult (legacy format), convert to new format
    if ('toolResult' in rawResult && rawResult.toolResult !== undefined && !('content' in rawResult)) {
        const legacyResult = rawResult as Record<string, unknown> & { toolResult: unknown };
        return {
            ...legacyResult,
            content: [
                {
                    type: "text",
                    text: typeof legacyResult.toolResult === 'string'
                        ? legacyResult.toolResult
                        : JSON.stringify(legacyResult.toolResult, null, 2)
                }
            ]
        } as CallToolResult;
    }

    // Already in standard format or has both fields
    return rawResult as CallToolResult;
}
