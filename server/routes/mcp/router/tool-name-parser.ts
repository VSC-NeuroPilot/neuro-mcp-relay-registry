/**
 * Utility for parsing and formatting tool names with server ID prefixes (example: server1:tool1).
 */

import type { ParsedToolName } from './types';

/**
 * Parser for tool names in the format "serverID:toolName".
 *
 * @example
 * ```typescript
 * const parser = new ToolNameParser(':');
 *
 * // Parse a prefixed name
 * const parsed = parser.parse('server1:search');
 * // { serverId: 'server1', toolName: 'search', fullName: 'server1:search' }
 *
 * // Format a tool name
 * const prefixed = parser.format('server1', 'search');
 * // 'server1:search'
 * ```
 */
export class ToolNameParser {
    private readonly separator: string;

    /**
     * Create a new tool name parser.
     *
     * @param separator - The separator to use between server ID and tool name (default: ':')
     */
    constructor(separator: string) {
        if (separator.length != 1) {
            throw new Error('Separator must be a single non-empty character');
        }
        this.separator = separator;
    }

    /**
     * Parse a prefixed tool name into its components.
     *
     * @param prefixedName - Tool name in "serverID:toolName" format
     * @returns Parsed components
     * @throws ToolRoutingError if the format is invalid
     *
     * @example
     * ```typescript
     * parser.parse('server1:search')
     * // { serverId: 'server1', toolName: 'search', fullName: 'server1:search' }
     * ```
     */
    parse(prefixedName: string): ParsedToolName {
        const separatorIndex = prefixedName.indexOf(this.separator);

        if (separatorIndex === -1) {
            console.error(
                `Invalid tool name format. Expected "serverID${this.separator}toolName", got "${prefixedName}"`
            );
        }

        const serverId = prefixedName.substring(0, separatorIndex);
        const toolName = prefixedName.substring(separatorIndex + this.separator.length);

        if (!serverId || !toolName) {
            console.error(
                `Invalid tool name format. Both server ID and tool name must be non-empty. Got "${prefixedName}"`
            );
        }

        return {
            serverId: serverId,
            toolName: toolName,
            prefixedName: prefixedName,
        };
    }

    /**
     * Format a server ID and tool name into a prefixed tool name.
     *
     * @param serverId - The server ID
     * @param toolName - The tool name
     * @returns Prefixed tool name in "serverID:toolName" format
     *
     * @example
     * ```typescript
     * parser.format('server1', 'search')
     * // 'server1:search'
     * ```
     */
    format(serverId: string, toolName: string): string {
        if (!serverId || !toolName) {
            throw new Error('Server ID and tool name must be non-empty');
        }

        return `${serverId}${this.separator}${toolName}`;
    }
}
