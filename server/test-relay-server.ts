/**
 * Test relay server that connects to multiple upstream MCP servers
 * and exposes them via /mcp endpoint with prefixed tool names
 *
 * Usage: tsx test-relay-server.ts <server-url-1> <server-url-2> ... [--host <host>] [--port <port>]
 * Example: tsx test-relay-server.ts  http://127.0.0.1:3000 http://127.0.0.1:8000 --host 127.0.0.1 --port 3100
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpRelayServer } from "./routes/mcp";
import { createServer } from "http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3100;

interface ParsedArgs {
    upstreamUrls: string[];
    host: string;
    port: number;
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    const upstreamUrls: string[] = [];
    let host = DEFAULT_HOST;
    let port = DEFAULT_PORT;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--host" || arg === "-h") {
            host = args[++i];
        } else if (arg === "--port" || arg === "-p") {
            port = parseInt(args[++i], 10);
        } else if (arg.startsWith("http://") || arg.startsWith("https://")) {
            upstreamUrls.push(arg);
        } else {
            console.error(`Unknown argument: ${arg}`);
            process.exit(1);
        }
    }

    return { upstreamUrls, host, port };
}

async function main() {
    const { upstreamUrls, host, port } = parseArgs();

    if (upstreamUrls.length === 0) {
        console.error("Error: Please provide at least one upstream server URL");
        console.error("Usage: tsx test-relay-server.ts <server-url-1> <server-url-2> ... [--host <host>] [--port <port>]");
        console.error("Example: tsx test-relay-server.ts http://127.0.0.1:3001 http://127.0.0.1:3002");
        console.error("Example: tsx test-relay-server.ts http://127.0.0.1:3001 --host 127.0.0.1 --port 3100");
        process.exit(1);
    }

    if (isNaN(port) || port < 1 || port > 65535) {
        console.error("Error: Invalid port number. Must be between 1 and 65535");
        process.exit(1);
    }

    console.log(`[Relay Server] Creating relay server for ${upstreamUrls.length} upstream server(s)`);

    // Create relay server instance
    const relayServer = new McpRelayServer({
        name: "test-relay-server",
        version: "0.0.1-test",
        maxPending: 100,
        lockTimeout: 30000,
        toolSeparator: ":", // Use colon as separator for serverID:toolName
    });

    // Initialize the relay server
    await relayServer.initialize();
    console.log(`[Relay Server] Relay server initialized`);

    // Get registry for server registration
    const registry = relayServer.getRegistry();

    // Register all upstream servers
    console.log(`\n[Relay Server] Registering upstream servers...`);
    for (let i = 0; i < upstreamUrls.length; i++) {
        const serverUrl = upstreamUrls[i];
        const serverId = `server${i + 1}`;

        console.log(`[Relay Server] Registering ${serverId}: ${serverUrl}`);

        try {
            const result = await registry.registerServer({
                serverId,
                clientConfig: {
                    transport: "http",
                    serverUrl,
                    name: `Server ${i + 1}`,
                },
                autoConnect: true,
            });

            if (result.success && result.serverInfo) {
                console.log(`[Relay Server] ✓ ${serverId} connected successfully`);
            } else {
                console.error(`[Relay Server] ✗ ${serverId} registration failed: ${result.error}`);
            }
        } catch (error) {
            console.error(`[Relay Server] ✗ ${serverId} registration error:`, error);
        }
    }

    // Show aggregated tools
    console.log(`\n[Relay Server] Aggregating tools...`);
    const router = relayServer.getRouter();
    const allTools = await router.listAllTools();
    console.log(`[Relay Server] Total tools available: ${allTools.length}`);

    if (allTools.length > 0) {
        console.log(`[Relay Server] Tool list (with prefixes):`);
        allTools.forEach((tool) => {
            console.log(`  - ${tool.name} (from ${tool.serverName})`);
        });
    }

    // Get permission manager
    const permissionManager = relayServer.getPermissionManager();
    const approvalQueue = permissionManager.getApprovalQueue();

    // Helper to parse JSON body
    async function parseJsonBody(req: any): Promise<any> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk: any) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(new Error('Invalid JSON'));
                }
            });
            req.on('error', reject);
        });
    }

    // Helper to send JSON response
    function sendJson(res: any, statusCode: number, data: any) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    }

    // Create HTTP server
    const httpServer = createServer(async (req, res) => {
        // Permission management endpoints
        if (req.url === '/api/permissions' && req.method === 'GET') {
            try {
                const permissions = await permissionManager.getAllPermissions();
                const toolsWithPermissions = await permissionManager.getToolsWithPermissions();
                sendJson(res, 200, {
                    configured: Array.from(permissions.entries()).map(([name, perm]) => ({
                        toolName: name,
                        mode: perm.mode,
                        lastModified: perm.lastModified,
                    })),
                    allTools: toolsWithPermissions,
                });
            } catch (error) {
                sendJson(res, 500, { error: String(error) });
            }
        } else if (req.url?.startsWith('/api/permissions/') && req.method === 'PUT') {
            try {
                const toolName = decodeURIComponent(req.url.split('/api/permissions/')[1]);
                const body = await parseJsonBody(req);
                const mode = body.mode;

                if (!['auto', 'copilot', 'disabled'].includes(mode)) {
                    sendJson(res, 400, { error: 'Invalid mode. Must be auto, copilot, or disabled' });
                    return;
                }

                await permissionManager.updatePermission(toolName, mode);
                sendJson(res, 200, { success: true, toolName, mode });
            } catch (error) {
                sendJson(res, 500, { error: String(error) });
            }
        } else if (req.url === '/api/permissions/batch' && req.method === 'POST') {
            try {
                const body = await parseJsonBody(req);
                const rawUpdates = body.updates || {};

                // Validate and convert to Map<string, PermissionMode>
                const updates = new Map<string, 'auto' | 'copilot' | 'disabled'>();
                for (const [toolName, mode] of Object.entries(rawUpdates)) {
                    if (!['auto', 'copilot', 'disabled'].includes(mode as string)) {
                        sendJson(res, 400, { error: `Invalid mode for ${toolName}: ${mode}` });
                        return;
                    }
                    updates.set(toolName, mode as 'auto' | 'copilot' | 'disabled');
                }

                await permissionManager.updatePermissions(updates);
                sendJson(res, 200, { success: true, count: updates.size });
            } catch (error) {
                sendJson(res, 500, { error: String(error) });
            }
        } else if (req.url === '/api/permissions/stats' && req.method === 'GET') {
            try {
                const stats = await permissionManager.getStats();
                sendJson(res, 200, stats);
            } catch (error) {
                sendJson(res, 500, { error: String(error) });
            }
        }
        // Approval queue endpoints
        else if (req.url === '/api/approvals/pending' && req.method === 'GET') {
            try {
                const pending = approvalQueue.getPending();
                sendJson(res, 200, pending);
            } catch (error) {
                sendJson(res, 500, { error: String(error) });
            }
        } else if (req.url?.startsWith('/api/approvals/') && req.url?.endsWith('/approve') && req.method === 'POST') {
            try {
                const approvalId = req.url.split('/api/approvals/')[1].split('/approve')[0];
                const body = await parseJsonBody(req);
                approvalQueue.approve(approvalId, body.message);
                sendJson(res, 200, { success: true, approvalId });
            } catch (error) {
                sendJson(res, 400, { error: String(error) });
            }
        } else if (req.url?.startsWith('/api/approvals/') && req.url?.endsWith('/reject') && req.method === 'POST') {
            try {
                const approvalId = req.url.split('/api/approvals/')[1].split('/reject')[0];
                const body = await parseJsonBody(req);
                approvalQueue.reject(approvalId, body.message);
                sendJson(res, 200, { success: true, approvalId });
            } catch (error) {
                sendJson(res, 400, { error: String(error) });
            }
        } else if (req.url === '/api/approvals/history' && req.method === 'GET') {
            try {
                const history = approvalQueue.getHistory(100);
                sendJson(res, 200, history);
            } catch (error) {
                sendJson(res, 500, { error: String(error) });
            }
        }
        // MCP endpoint
        else if (req.url === "/mcp") {
            console.log(`[Relay Server] Incoming ${req.method} request from ${req.socket.remoteAddress}`);

            try {
                // Get the MCP server instance
                const mcpServer = relayServer.getMcpServer();

                // Create transport with stateless mode (no session management)
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined, // Stateless mode
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
            const info = await relayServer.getInfo();
            const stats = await registry.getStats();

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify(
                    {
                        status: "ok",
                        ...info,
                        servers: {
                            total: stats.totalServers,
                            connected: stats.connectedServers,
                            disconnected: stats.disconnectedServers,
                            errored: stats.erroredServers,
                        },
                    },
                    null,
                    2
                )
            );
        } else if (req.url === "/stats") {
            // Detailed stats endpoint
            const stats = await registry.getStats();
            const servers = await registry.listServers();

            const serverDetails = await Promise.all(
                servers.map(async (serverId) => {
                    const wrapper = await registry.getServer(serverId);
                    if (!wrapper) return null;

                    const info = wrapper.getInfo();
                    return {
                        serverId,
                        name: info.name,
                        state: info.state,
                        connectedAt: info.connectedAt?.toISOString(),
                        error: info.error,
                    };
                })
            );

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify(
                    {
                        stats,
                        servers: serverDetails.filter((s) => s !== null),
                    },
                    null,
                    2
                )
            );
        } else {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end(
                `Not Found

Available Endpoints:

MCP Protocol:
  POST /mcp - MCP endpoint for tool calls

Server Info:
  GET /health - Health check
  GET /stats - Detailed statistics

Permission Management:
  GET /api/permissions - List all permissions
  PUT /api/permissions/:toolName - Update permission for a tool (body: {mode: 'auto'|'copilot'|'disabled'})
  POST /api/permissions/batch - Batch update permissions (body: {updates: {toolName: mode}})
  GET /api/permissions/stats - Permission system statistics

Approval Queue:
  GET /api/approvals/pending - List pending approvals
  POST /api/approvals/:id/approve - Approve a pending request (body: {message?: string})
  POST /api/approvals/:id/reject - Reject a pending request (body: {message?: string})
  GET /api/approvals/history - Get approval history
`
            );
        }
    });

    httpServer.listen(port, host, () => {
        console.log(`\n[Relay Server] Server running on http://${host}:${port}`);
        console.log(`[Relay Server] MCP endpoint: http://${host}:${port}/mcp`);
        console.log(`[Relay Server] Health check: http://${host}:${port}/health`);
        console.log(`[Relay Server] Statistics: http://${host}:${port}/stats`);
        console.log(`[Relay Server] Permissions API: http://${host}:${port}/api/permissions`);
        console.log(`[Relay Server] Approvals API: http://${host}:${port}/api/approvals/pending`);
        console.log(`[Relay Server] Proxying to ${upstreamUrls.length} upstream server(s)\n`);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\n[Relay Server] Shutting down...");
        await relayServer.shutdown();
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
