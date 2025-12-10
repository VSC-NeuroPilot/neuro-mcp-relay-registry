/**
 * McpRelayServer aggregates multiple upstream servers and exposes them as a unified MCP server to downstream clients.
 * This class handles MCP protocol interactions and delegates tool operations to the router and registry.
 */

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {CallToolRequest, ListToolsRequest} from '@modelcontextprotocol/sdk/types.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {ServerRegistry} from '../registry';
import {ToolRouter} from '../router';
import type {McpRelayServerConfig, RelayServerInfo} from './types';

/**
 * This class aggregates tools from multiple upstream servers.
 *
 * @example
 * ```typescript
 * // Create relay server
 * const relayServer = new McpRelayServer({
 *   name: 'my-relay',
 *   version: '1.0.0'
 * });
 *
 * // Initialize handlers
 * await relayServer.initialize();
 *
 * // Register upstream servers
 * const registry = relayServer.getRegistry();
 * await registry.registerServer({
 *   serverId: 'server1',
 *   clientConfig: { transport: 'http', serverUrl: 'http://localhost:3001', name: 'Server 1' }
 * });
 *
 * // Get MCP server instance for transport attachment
 * const mcpServer = relayServer.getMcpServer();
 *
 * // Shutdown when done
 * await relayServer.shutdown();
 * ```
 */
export class McpRelayServer {
    private readonly mcpServer: McpServer;
    private readonly registry: ServerRegistry;
    private readonly router: ToolRouter;
    private readonly config: McpRelayServerConfig;
    private readonly startTime: Date;
    private initialized: boolean = false;

    /**
     * Create a new MCP relay server.
     *
     * @param config - Server configuration
     */
    constructor(config: McpRelayServerConfig) {
        this.config = config;
        this.startTime = new Date();

        // Create or use provided registry
        this.registry = config.registry ?? new ServerRegistry(config.maxPending, config.lockTimeout);
        this.router = new ToolRouter(this.registry, config.toolSeparator);
        this.mcpServer = new McpServer(
            {
                name: config.name,
                version: config.version,
            },
            {
                capabilities: {
                    tools: {}
                },
                instructions: config.instructions
            }
        );
    }

    /**
     * Initialize the server by setting up MCP protocol handlers.
     *
     * This must be called before the server can handle requests.
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            throw new Error('Server is already initialized');
        }

        this.setupHandlers();
        this.initialized = true;
    }

    /**
     * Get the underlying MCP server instance.
     *
     * Use this to connect transports for handling downstream client connections.
     *
     * @returns The MCP server instance
     *
     * @example
     * ```typescript
     * const mcpServer = relayServer.getMcpServer();
     * const transport = new StreamableHTTPServerTransport({...});
     * await mcpServer.connect(transport);
     * ```
     */
    public getMcpServer(): McpServer {
        return this.mcpServer;
    }

    /**
     * Get the server registry for managing upstream servers.
     *
     * @returns The server registry instance
     *
     * @example
     * ```typescript
     * const registry = relayServer.getRegistry();
     * await registry.registerServer({...});
     * ```
     */
    public getRegistry(): ServerRegistry {
        return this.registry;
    }

    /**
     * Get the tool router.
     *
     * @returns The tool router instance
     */
    public getRouter(): ToolRouter {
        return this.router;
    }

    // ===== Public API =====

    /**
     * Get information about the relay server.
     *
     * @returns Server information including stats
     */
    public async getInfo(): Promise<RelayServerInfo> {
        const stats = await this.registry.getStats();
        const uptime = Date.now() - this.startTime.getTime();

        return {
            name: this.config.name,
            version: this.config.version,
            registeredServers: stats.totalServers,
            totalTools: stats.totalTools,
            uptime
        };
    }

    /**
     * Shutdown the server and disconnect all upstream servers.
     *
     * @example
     * ```typescript
     * await relayServer.shutdown();
     * ```
     */
    public async shutdown(): Promise<void> {
        // Close MCP server
        await this.mcpServer.close();

        // Shutdown registry (disconnects all servers)
        await this.registry.shutdown();

        this.initialized = false;
    }

    /**
     * Set up MCP protocol handlers for tool listing and calling.
     */
    private setupHandlers(): void {
        // Register tool list handler
        this.mcpServer.server.setRequestHandler(
            ListToolsRequestSchema,
            async (request: ListToolsRequest) => {
                return this.handleListTools(request);
            }
        );

        // Register tool call handler
        this.mcpServer.server.setRequestHandler(
            CallToolRequestSchema,
            async (request: CallToolRequest) => {
                return this.handleCallTool(request);
            }
        );
    }

    /**
     * Handle tools/list request - return all tools from all servers.
     */
    private async handleListTools(_request: ListToolsRequest) {
        const tools = await this.router.listAllTools();

        return {
            tools: tools as any, // Type conversion for MCP SDK compatibility
        };
    }

    /**
     * Handle tools/call request - route to appropriate server.
     */
    private async handleCallTool(request: CallToolRequest) {
        const {name, arguments: args} = request.params;

        const result = await this.router.callTool(name, args);

        // Return the result directly - it's already in CallToolResult format
        return result.result;
    }
}
