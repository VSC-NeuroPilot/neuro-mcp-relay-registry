/**
 * ToolRouter routes tool calls to the appropriate upstream server based on prefixed tool names.
 *
 * Tool names are in the format "serverID:toolName" where serverID identifies which upstream server provides the tool.
 */

import type {McpToolCallResult} from '../clients/types';
import {createErrorToolCallResult} from '../clients/util';
import type {AggregatedTool, ServerRegistry} from '../registry';
import {ToolNameParser} from './tool-name-parser';
import type {ParsedToolName} from './types';

/**
 * Routes tool calls to the appropriate upstream server.
 *
 * Handles tool name parsing, routing logic, and result normalization.
 *
 * @example
 * ```typescript
 * const registry = new ServerRegistry();
 * const router = new ToolRouter(registry);
 *
 * // List all tools with prefixes
 * const tools = await router.listAllTools();
 * // [{ name: 'server1:search', ... }, { name: 'server2:fetch', ... }]
 *
 * // Call a tool using prefixed name
 * const result = await router.callTool('server1:search', { query: 'test' });
 * ```
 */
export class ToolRouter {
    private readonly registry: ServerRegistry;
    private readonly parser: ToolNameParser;

    /**
     * Create a new tool router.
     *
     * @param registry - The server registry to route tools through
     * @param separator - Tool name separator (default: ':')
     */
    constructor(registry: ServerRegistry, separator: string) {
        this.registry = registry;
        this.parser = new ToolNameParser(separator);
    }

    /**
     * List all available tools across all registered servers.
     *
     * Returns tools with prefixed names in "serverID:toolName" format.
     *
     * @returns Array of aggregated tools with server information and prefixed names
     *
     * @example
     * ```typescript
     * const tools = await router.listAllTools();
     * console.log(tools[0].name); // 'server1:search'
     * console.log(tools[0].originalName); // 'search'
     * console.log(tools[0].serverId); // 'server1'
     * ```
     */
    public async listAllTools(): Promise<readonly AggregatedTool[]> {
        const aggregatedTools = await this.registry.getAllTools();

        return aggregatedTools.map((tool) => {
            const prefixedName = this.parser.format(tool.serverId, tool.originalName);

            return {
                ...tool,
                name: prefixedName, // Override with prefixed name
            };
        });
    }

    /**
     * Call a tool using a prefixed tool name.
     *
     * @param prefixedToolName - Tool name in "serverID:toolName" format
     * @param args - Arguments to pass to the tool
     * @returns Tool execution result
     * @throws ToolRoutingError if routing fails
     *
     * @example
     * ```typescript
     * const result = await router.callTool('server1:search', {
     *   query: 'test'
     * });
     * ```
     */
    public async callTool(
        prefixedToolName: string,
        args?: Record<string, unknown>
    ): Promise<McpToolCallResult> {
        // Parse the tool name
        let parsed: ParsedToolName;
        try {
            parsed = this.parser.parse(prefixedToolName);
        } catch (error) {
            return createErrorToolCallResult(String(error));
        }

        const {serverId, toolName} = parsed;

        // Check if server exists
        const hasServer = await this.registry.hasServer(serverId);
        if (!hasServer) {
            return createErrorToolCallResult(`Server '${serverId}' not found in registry`);
        }

        // Route to the appropriate server
        return this.registry.callTool(serverId, toolName, args);
    }
}
