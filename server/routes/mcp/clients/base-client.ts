import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpClientConfig, McpToolCallResult } from './types';
import { createErrorToolCallResult, normalizeCallToolResult } from './util';

/**
 * Abstract base class for MCP clients.
 * Provides a universal API that works across all transport types (HTTP, SSE, STDIO).
 *
 * All concrete implementations must extend this class and implement its abstract methods.
 */
export abstract class BaseMcpClient {
    public serverName: string;
    /**
     * Configuration for this client
     */
    protected config: McpClientConfig;

    /**
     * MCP SDK client instance - shared across all transport types
     */
    protected mcpClient: Client | null = null;

    /**
     * Cached list of available tools
     */
    protected tools: Tool[] = [];

    /**
     * Connection state
     */
    protected connected: boolean = false;

    /**
     * @param config - Client configuration
     */
    protected constructor(config: McpClientConfig) {
        this.config = config;
        this.initializeClient();
        this.serverName = this.getDisplayName();
    }

    public get availableTools(): readonly Tool[] {
        return this.tools;
    }

    public get availableToolNames(): readonly string[] {
        return this.getToolNamesFromTools();
    }

    /**
     * Connect to the MCP server.
     * For HTTP/SSE: connects to the specified URL
     * For STDIO: spawns the process and establishes communication
     *
     * @throws Error if connection fails
     */
    public abstract connectToServer(): Promise<void>;

    /**
     * Disconnect from the MCP server and clean up resources.
     *
     * @throws Error if disconnection fails or encounters issues
     */
    public abstract disconnectFromServer(): Promise<void>;

    /**
     * Get the configuration for this client.
     */
    public getConfig(): Readonly<McpClientConfig> {
        return this.config;
    }

    /**
     * Get a display name for this client.
     * Uses config.name if provided, otherwise generates from config.
     */
    public getDisplayName(): string {
        if (this.config.name) {
            return this.config.name;
        }

        switch (this.config.transport) {
            case 'http':
            case 'sse':
                return `${this.config.transport.toUpperCase()}: ${this.config.serverUrl}`;
            case 'stdio':
                return `STDIO: ${this.config.command}`;
            default:
                return 'Unknown MCP Client';
        }
    }

    /**
     * Call a tool on the connected server.
     * This implementation works for all transport types.
     * Subclasses can override if needed, but usually don't need to.
     */
    public async callTool(toolName: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
        if (!this.mcpClient || !this.connected) {
            return createErrorToolCallResult('MCP Client not connected or configured properly');
        }

        try {
            const response = await this.mcpClient.callTool({
                name: toolName,
                arguments: args ?? {},
            });

            return {
                success: true,
                result: normalizeCallToolResult(response),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return createErrorToolCallResult(errorMessage);
        }
    }

    // Protected helper methods

    /**
     * Refresh the list of tools from the server.
     * This implementation works for all transport types.
     * Subclasses can override if needed.
     */
    public async refreshTools(): Promise<void> {
        this.tools = await this.listToolsFromServer();

        if (this.tools.length === 0) {
            console.warn(`[${this.getDisplayName()}] No tools found. Please check your configuration.`);
        }
    }

    /**
     * Initialize the MCP client instance.
     * Can be overridden by subclasses if custom client options are needed.
     */
    protected initializeClient(): void {
        this.mcpClient = new Client({
            name: this.config.name || 'mcp-client',
            version: '1.0.0',
        });
    }

    /**
     * Fetch tools from the MCP server.
     * This is the same for all transport types.
     */
    protected async listToolsFromServer(): Promise<Tool[]> {
        if (!this.connected || !this.mcpClient) {
            console.warn(`[${this.getDisplayName()}] Server not connected! Run connectToServer() first.`);
            return [];
        }

        try {
            const response = await this.mcpClient.listTools();
            return response.tools;
        } catch (error) {
            console.error(`[${this.getDisplayName()}] Unable to list tools:`, error);
            return [];
        }
    }

    /**
     * Extract tool names from the tools array.
     * This is the same for all transport types.
     */
    protected getToolNamesFromTools(): string[] {
        return this.tools.map(t => t.name);
    }

    /**
     * Clean up resources when disconnecting.
     * Subclasses should call this in their disconnectFromServer() implementation.
     */
    protected async cleanupResources(): Promise<void> {
        this.connected = false;

        if (this.mcpClient) {
            await this.mcpClient.close();
        }

        this.mcpClient = null;
        this.tools = [];
    }
}
