import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {
    StreamableHTTPClientTransport,
    StreamableHTTPClientTransportOptions
} from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { McpToolCallResult, normalizeCallToolResult } from "./util";


export class StreamableHttpMcpClient {
    private transport: StreamableHTTPClientTransport | null = null;
    private serverUrl: URL | null = null;
    private extraTransportConfigs: StreamableHTTPClientTransportOptions | null = null;
    private mcpClient: Client | null = null;
    private tools: Tool[] = [];
    private connected: boolean = false;

    // Public Methods

    public constructor() {
        this.mcpClient = new Client({name: "mcp-client-cli", version: "1.0.0"});
    }

    public get isConnected(): boolean {
        return this.connected;
    }

    public get availableTools(): readonly Tool[] {
        return this.tools;
    }

    public get availableToolNames(): readonly string[] {
        return this.getToolNames();
    }

    public async connectToServer(serverBaseAddress: string, extraTransportConfigs?: StreamableHTTPClientTransportOptions): Promise<void> {
        if (!this.mcpClient) {
            throw new Error(`Cannot connect to server at ${serverBaseAddress} because client is not initialized.`);
        }

        // Init transport and connect to server
        try {
            this.serverUrl = new URL('/mcp', serverBaseAddress);

            if (extraTransportConfigs) {
                this.extraTransportConfigs = extraTransportConfigs;
                this.transport = new StreamableHTTPClientTransport(
                    this.serverUrl,
                    this.extraTransportConfigs
                );
            } else {
                this.transport = new StreamableHTTPClientTransport(
                    this.serverUrl,
                );
            }

            await this.mcpClient.connect(this.transport);
            this.connected = true;

            this.tools = await this.listTools();

        } catch (erm) {
            this.connected = false;
            this.transport = null;

            throw new Error(`Unable to connect to server at ${this.serverUrl}: ${erm}`);
        }
    }

    public async refreshTools(): Promise<void> {
        this.tools = await this.listTools();

        if (this.tools.length == 0) {
            console.warn("No tools found. Please check your configuration.");
        }
    }

    public async disconnectFromServer(): Promise<void> {
        if (!this.connected) {
            console.warn("Server is already disconnected. Skipping...");
            return;
        }

        try {
            this.connected = false;

            if (this.mcpClient) {
                await this.mcpClient.close();
            }
            this.mcpClient = null;
            this.transport = null;
            this.tools = [];

        } catch (erm) {
            console.error(`Unable to disconnect from server at ${this.serverUrl}: ${erm}. Force cleaning up now.`);
            this.connected = false;
            this.transport = null;
            this.mcpClient = null;
            this.tools = []
        }
    }

    /**
     * Calls a tool on the MCP server and get text result
     *
     * @param toolName - Name of the tool to call
     * @param args - Arguments to pass to the tool
     * @returns Tool execution result
     * @throws Error if not connected or if tool execution fails
     */
    public async callTool(toolName: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
        if (!this.mcpClient || !this.connected) {
            return {
                success: false,
                result: {
                    content: [
                        {
                            type: "text",
                            text: "MCP Client not connected or configured properly"
                        }
                    ],
                    isError: true
                },
            };
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
        } catch (erm) {
            const errorMessage = erm instanceof Error ? erm.message : String(erm);
            return {
                success: false,
                result: {
                    content: [
                        {
                            type: "text",
                            text: errorMessage
                        }
                    ],
                    isError: true
                },
            };
        }
    }

    // Private Methods

    private async listTools(): Promise<Tool[]> {
        if (!this.connected || !this.mcpClient) {
            console.warn("Server not connected or client is null! Run connectToServer() first!");
            return [];
        }

        try {
            const response = await this.mcpClient.listTools();
            return response.tools;
        } catch (erm) {
            console.error(`Unable to list tools from server at ${this.serverUrl}: ${erm}`);
            return [];
        }
    }

    private getToolNames(): string[] {
        return this.tools.map(t => t.name)
    }
}
