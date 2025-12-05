/**
 * Test relay server that connects to a single upstream MCP server
 * and exposes it via /mcp endpoint for testing
 *
 * Usage: tsx test-relay-server.ts <upstream-server-url> [host] [port]
 * Example: tsx test-relay-server.ts http://localhost:3001 127.0.0.1 3100
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpClientFactory } from "./routes/mcp/index.js";
import type { BaseMcpClient } from "./routes/mcp/index.js";
import { createServer } from "http";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 3100;

async function main() {
    const upstreamUrl = process.argv[2];
    const relayHost = process.argv[3] || DEFAULT_HOST;
    const relayPort = process.argv[4] ? parseInt(process.argv[4], 10) : DEFAULT_PORT;

    if (!upstreamUrl) {
        console.error("Error: Please provide upstream server URL");
        console.error("Usage: tsx test-relay-server.ts <upstream-server-url> [host] [port]");
        console.error("Example: tsx test-relay-server.ts http://localhost:3001");
        console.error("Example: tsx test-relay-server.ts http://localhost:3001 127.0.0.1 3100");
        process.exit(1);
    }

    if (isNaN(relayPort) || relayPort < 1 || relayPort > 65535) {
        console.error("Error: Invalid port number. Must be between 1 and 65535");
        process.exit(1);
    }

    console.log(`[Relay Server] Connecting to upstream server: ${upstreamUrl}`);

    // Create client using factory - supports multiple transport types
    const upstreamClient: BaseMcpClient = McpClientFactory.create({
        transport: 'http',
        serverUrl: upstreamUrl,
        name: 'Upstream Server'
    });

    try {
        await upstreamClient.connectToServer();
        console.log(`[Relay Server] Connected to upstream server`);
        console.log(`[Relay Server] Available tools: ${upstreamClient.availableToolNames.join(", ")}`);
    } catch (error) {
        console.error(`[Relay Server] Failed to connect to upstream server:`, error);
        process.exit(1);
    }

    // Function to create a new MCP server instance for each request
    function createMcpServer(): McpServer {
        const mcpServer = new McpServer({
            name: "test-relay-server",
            version: "0.0.1-test"
        }, {
            capabilities: {
                tools: {}
            }
        });

        // Register tool list handler - return tools from upstream
        // Use the underlying server property for advanced operations
        mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: upstreamClient.availableTools
            };
        });

        // Register tool call handler - forward to upstream
        mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            console.log(`[Relay Server] Forwarding tool call: ${name}`);
            console.log(`[Relay Server] Arguments:`, JSON.stringify(args, null, 2));

            const result = await upstreamClient.callTool(name, args);

            if (!result.success) {
                console.error(`[Relay Server] Tool call failed:`, result.result);
            } else {
                console.log(`[Relay Server] Tool call succeeded`);
            }

            return result.result;
        });

        return mcpServer;
    }

    // Create HTTP server
    const httpServer = createServer(async (req, res) => {
        if (req.url === "/mcp") {
            console.log(`[Relay Server] Incoming ${req.method} request from ${req.socket.remoteAddress}`);

            // Handle MCP requests - create a new server instance for each request
            const mcpServer = createMcpServer();

            try {
                // Create transport with stateless mode (no session management)
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined  // Stateless mode
                });

                console.log(`[Relay Server] Transport created, connecting server...`);

                // Connect the server to the transport (sets up message handlers)
                await mcpServer.connect(transport);
                console.log(`[Relay Server] Server connected to transport`);

                // Handle the actual HTTP request using the transport
                console.log(`[Relay Server] Processing request through transport...`);
                await transport.handleRequest(req, res);
                console.log(`[Relay Server] Request processed successfully`);

            } catch (error) {
                console.error(`[Relay Server] Error handling MCP request:`, error);
                console.error(`[Relay Server] Error stack:`, error instanceof Error ? error.stack : String(error));
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Internal server error" }));
                }
            }
        } else if (req.url === "/health") {
            // Health check endpoint
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "ok",
                upstream: upstreamUrl,
                connected: upstreamClient.isConnected,
                tools: upstreamClient.availableToolNames
            }));
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found\n\nEndpoints:\n  POST /mcp - MCP endpoint\n  GET /health - Health check");
        }
    });

    httpServer.listen(relayPort, relayHost, () => {
        console.log(`\n[Relay Server] Server running on http://${relayHost}:${relayPort}`);
        console.log(`[Relay Server] MCP endpoint: http://${relayHost}:${relayPort}/mcp`);
        console.log(`[Relay Server] Health check: http://${relayHost}:${relayPort}/health`);
        console.log(`[Relay Server] Proxying to: ${upstreamUrl}\n`);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\n[Relay Server] Shutting down...");
        await upstreamClient.disconnectFromServer();
        httpServer.close(() => {
            console.log("[Relay Server] Server closed");
            process.exit(0);
        });
    });
}

main().catch((error) => {
    console.error("[Relay Server] Fatal error:", error);
    process.exit(1);
});
