/**
 * MCP Client, Registry, and Router Module
 *
 * Provides a complete system for:
 * - Connecting to MCP servers via different transports (HTTP, SSE, STDIO)
 * - Managing multiple upstream servers with a registry
 * - Routing tool calls to appropriate servers
 * - Exposing aggregated tools as a unified MCP server
 *
 * @example
 * ```typescript
 * import { McpClientFactory, McpRelayServer } from './routes/mcp';
 *
 * // Create a relay server
 * const relay = new McpRelayServer({
 *   name: 'my-relay',
 *   version: '1.0.0'
 * });
 *
 * await relay.initialize();
 *
 * // Register upstream servers
 * const registry = relay.getRegistry();
 * await registry.registerServer({
 *   serverId: 'server1',
 *   clientConfig: {
 *     transport: 'http',
 *     serverUrl: 'http://127.0.0.1:3001',
 *     name: 'Server 1'
 *   }
 * });
 *
 * // Get MCP server for transport attachment
 * const mcpServer = relay.getMcpServer();
 * ```
 */

// ===== Client Module =====

// Base client and factory
export { BaseMcpClient } from './clients/base-client';
export { McpClientFactory } from './clients/factory';

// Concrete implementations
export { StreamableHttpMcpClient } from './clients/http';

// Client types
export type {
    TransportType,
    BaseMcpClientConfig,
    HttpMcpClientConfig,
    SseMcpClientConfig,
    StdioMcpClientConfig,
    McpClientConfig,
    ConnectionState,
    ServerInfo,
    McpToolCallResult,
    RawCallToolResult,
} from './clients/types';

// ===== Registry Module =====

export { ServerRegistry, ServerWrapper, AsyncRWLock, AsyncMutex } from './registry/index';

export type { AggregatedTool, ServerRegistrationConfig, RegistrationResult, RegistryStats } from './registry/index';

// ===== Router Module =====

export { ToolRouter, ToolNameParser } from './router/index';

export type { ParsedToolName } from './router/index';

// ===== Server Module =====

export { McpRelayServer } from './server/index';

export type { McpRelayServerConfig, RelayServerInfo } from './server/index';
