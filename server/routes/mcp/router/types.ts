/**
 * Type definitions for the tool router system.
 */

/**
 * Result of parsing a prefixed tool name.
 */
export interface ParsedToolName {
    /**
     * Server ID extracted from the prefix
     */
    serverId: string;

    /**
     * Tool name without the prefix
     */
    toolName: string;

    /**
     * Original full prefixed name
     */
    prefixedName: string;
}
