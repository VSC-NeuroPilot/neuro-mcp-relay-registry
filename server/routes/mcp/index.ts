/**
 * MCP Client Module
 *
 * Provides a universal API for connecting to MCP servers via different transports:
 * - HTTP (Streamable HTTP)
 * - SSE (Server-Sent Events)
 * - STDIO (Standard Input/Output)
 *
 * @example
 * ```typescript
 * import { McpClientFactory } from './routes/mcp';
 *
 * // Create an HTTP client
 * const client = McpClientFactory.create({
 *   transport: 'http',
 *   serverUrl: 'http://localhost:3000',
 *   name: 'My MCP Server'
 * });
 *
 * await client.connectToServer();
 * const tools = client.availableTools;
 * const result = await client.callTool('my-tool', { arg: 'value' });
 * await client.disconnectFromServer();
 * ```
 */

// Base client and factory
export {BaseMcpClient} from './clients/base-client';
export {McpClientFactory} from './factory';

// Concrete implementations
export {StreamableHttpMcpClient} from './clients/http';

// Types
export type {
    TransportType,
    BaseMcpClientConfig,
    HttpMcpClientConfig,
    SseMcpClientConfig,
    StdioMcpClientConfig,
    McpClientConfig,
    ConnectionState,
    ServerInfo
} from './clients/types';

// Utilities
export type {McpToolCallResult, RawCallToolResult} from './clients/types';
