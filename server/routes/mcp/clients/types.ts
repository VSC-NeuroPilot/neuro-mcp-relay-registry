import type {StreamableHTTPClientTransportOptions} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {SSEClientTransportOptions} from "@modelcontextprotocol/sdk/client/sse.js";
import type {StdioServerParameters} from "@modelcontextprotocol/sdk/client/stdio.js";
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

/**
 * Supported MCP transport types
 */
export type TransportType = 'http' | 'sse' | 'stdio';

/**
 * Base configuration for all MCP clients
 */
export interface BaseMcpClientConfig {
    /**
     * Transport type to use
     */
    transport: TransportType;

    /**
     * Display name for this server connection
     */
    name?: string;

    /**
     * Optional metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Configuration for Streamable HTTP transport
 */
export interface HttpMcpClientConfig extends BaseMcpClientConfig {
    transport: 'http';

    /**
     * Server base URL (e.g., "http://localhost:3000")
     */
    serverUrl: string;

    /**
     * Optional transport-specific options
     */
    options?: StreamableHTTPClientTransportOptions;
}

/**
 * Configuration for SSE transport
 */
export interface SseMcpClientConfig extends BaseMcpClientConfig {
    transport: 'sse';

    /**
     * Server URL for SSE endpoint
     */
    serverUrl: string;

    /**
     * Optional transport-specific options
     */
    options?: SSEClientTransportOptions;
}

/**
 * Configuration for STDIO transport
 * Extends StdioServerParameters from the MCP SDK
 */
export interface StdioMcpClientConfig extends BaseMcpClientConfig, Omit<StdioServerParameters, 'command'> {
    transport: 'stdio';

    /**
     * Command to execute (e.g., "npx", "node", "python")
     */
    command: string;

    /**
     * Command arguments (inherited from StdioServerParameters)
     * @example ['-y', '@modelcontextprotocol/server-everything']
     */
    args?: string[];

    /**
     * Environment variables (inherited from StdioServerParameters)
     */
    env?: Record<string, string>;

    /**
     * Working directory for the process (inherited from StdioServerParameters)
     */
    cwd?: string;

    /**
     * How to handle stderr (inherited from StdioServerParameters)
     * Default is "inherit" - prints to parent process stderr
     */
    stderr?: StdioServerParameters['stderr'];
}

/**
 * Union type for all client configurations
 */
export type McpClientConfig =
    | HttpMcpClientConfig
    | SseMcpClientConfig
    | StdioMcpClientConfig;

/**
 * Server connection state
 */
export type ConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'error';

/**
 * Server connection information
 */
export interface ServerInfo {
    /**
     * Unique identifier for this server
     */
    id: string;

    /**
     * Display name
     */
    name: string;

    /**
     * Configuration used to connect
     */
    config: McpClientConfig;

    /**
     * Current connection state
     */
    state: ConnectionState;

    /**
     * Error message if state is 'error'
     */
    error?: string;

    /**
     * Number of available tools
     */
    toolCount: number;

    /**
     * When the connection was established
     */
    connectedAt?: Date;
}

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
