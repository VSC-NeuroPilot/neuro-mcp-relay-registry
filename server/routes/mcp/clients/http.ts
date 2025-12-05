import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {BaseMcpClient} from "./base-client";
import type {HttpMcpClientConfig} from "./types";

/**
 * MCP client implementation using Streamable HTTP transport.
 * Extends BaseMcpClient to provide a universal API.
 */
export class StreamableHttpMcpClient extends BaseMcpClient {
    private transport: StreamableHTTPClientTransport | null = null;
    private serverUrl: URL | null = null;

    /**
     * Create a new HTTP MCP client
     * @param config - HTTP client configuration
     */
    public constructor(config: HttpMcpClientConfig) {
        super(config);
        // mcpClient, tools, and connected are now inherited from BaseMcpClient
    }

    /**
     * Connect to the HTTP MCP server using the configuration provided in constructor.
     * @throws Error if connection fails
     */
    public async connectToServer(): Promise<void> {
        if (!this.mcpClient) {
            throw new Error('MCP client is not initialized');
        }

        const httpConfig = this.config as HttpMcpClientConfig;

        try {
            // Create URL with /mcp endpoint
            this.serverUrl = new URL('/mcp', httpConfig.serverUrl);

            // Create transport with optional config
            this.transport = httpConfig.options
                ? new StreamableHTTPClientTransport(this.serverUrl, httpConfig.options)
                : new StreamableHTTPClientTransport(this.serverUrl);

            // Connect client to transport
            await this.mcpClient.connect(this.transport);
            this.connected = true;

            // Load available tools using inherited method
            this.tools = await this.listToolsFromServer();

        } catch (error) {
            this.connected = false;
            this.transport = null;
            throw new Error(`Unable to connect to server at ${httpConfig.serverUrl}: ${error}`);
        }
    }

    // refreshTools() is now inherited from BaseMcpClient
    // callTool() is now inherited from BaseMcpClient

    public async disconnectFromServer(): Promise<void> {
        if (!this.connected) {
            console.warn(`[${this.getDisplayName()}] Server is already disconnected. Skipping...`);
            return;
        }

        try {
            // Clean up HTTP-specific resources
            this.transport = null;

            // Use inherited cleanup for common resources
            await this.cleanupResources();

        } catch (error) {
            console.error(`[${this.getDisplayName()}] Error during disconnect: ${error}. Force cleaning up...`);
            // Force cleanup
            this.transport = null;
            await this.cleanupResources().catch(() => {
                // Ignore errors during force cleanup
            });
        }
    }
}
