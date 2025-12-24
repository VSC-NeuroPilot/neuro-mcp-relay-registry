/**
 * Type definitions for the MCP relay server.
 */

import type { ServerRegistry } from '../registry';
import type { PermissionMode } from '../permissions';

/**
 * Configuration for the MCP relay server.
 */
export interface McpRelayServerConfig {
    /**
     * Server name (for MCP protocol identification)
     */
    name: string;

    /**
     * Server version
     */
    version: string;

    /**
     * Maximum pending requests allowed
     */
    maxPending: number;

    /**
     * Timeout in milliseconds for the lock to prevent deadlock
     */
    lockTimeout: number;

    /**
     * Separator for prefixing used when constructing tool names (e.g., the ":" in server1:tool1)
     */
    toolSeparator: string;

    /**
     * Optional pre-configured server registry.
     * If not provided, a new registry will be created.
     */
    registry?: ServerRegistry;

    /**
     * Optional server instructions (shown to clients)
     */
    instructions?: string;

    /**
     * Default permission mode for tools
     * @default 'copilot'
     */
    defaultPermissionMode?: PermissionMode;

    /**
     * Default approval timeout in milliseconds
     * @default 300000 (5 minutes)
     */
    defaultApprovalTimeout?: number;

    /**
     * Maximum approval history size
     * @default 1000
     */
    approvalHistoryMaxSize?: number;
}

/**
 * Information about the relay server instance.
 */
export interface RelayServerInfo {
    /**
     * Server name
     */
    name: string;

    /**
     * Server version
     */
    version: string;

    /**
     * Number of registered upstream servers
     */
    registeredServers: number;

    /**
     * Total number of tools across all servers
     */
    totalTools: number;

    /**
     * Server uptime in milliseconds
     */
    uptime: number;
}
