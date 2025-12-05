import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {RawCallToolResult} from "./types";

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
