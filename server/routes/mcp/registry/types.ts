/**
 * Type definitions for the server registry system.
 */

import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {McpClientConfig, ServerInfo} from '../clients/types';

/**
 * Tool with server source information for aggregated tool lists.
 *
 * The `name` field (inherited from Tool) may contain a prefix in the format "serverID:toolName"
 * when used by the router, or remain unprefixed when used directly by the registry.
 * The `originalName` field always contains the unprefixed tool name.
 */
export interface AggregatedTool extends Tool {
    /**
     * ID of the server providing this tool
     */
    serverId: string;

    /**
     * Original tool name (without any prefix)
     */
    originalName: string;

    /**
     * Display name of the server
     */
    serverName: string;
}

/**
 * Configuration for registering a new server in the registry.
 */
export interface ServerRegistrationConfig {
    /**
     * Unique identifier for the server
     */
    serverId: string;

    /**
     * MCP client configuration (transport type, URLs, etc.)
     */
    clientConfig: McpClientConfig;

    /**
     * Whether to connect to the server immediately after registration
     * @default true
     */
    autoConnect?: boolean;

    /**
     * Optional metadata about the server (for display/tracking purposes)
     */
    metadata?: Record<string, unknown>;
}

/**
 * Result of a server registration operation.
 */
export interface RegistrationResult {
    /**
     * Whether the registration was successful
     */
    success: boolean;

    /**
     * Server information if registration succeeded
     */
    serverInfo?: ServerInfo;

    /**
     * Error message if registration failed
     */
    error?: string;
}

/**
 * Statistics about the registry state.
 */
export interface RegistryStats {
    /**
     * Total number of registered servers
     */
    totalServers: number;

    /**
     * Number of servers currently connected
     */
    connectedServers: number;

    /**
     * Number of servers currently disconnected
     */
    disconnectedServers: number;

    /**
     * Number of servers in error state
     */
    erroredServers: number;

    /**
     * Total number of tools across all servers
     */
    totalTools: number;
}
