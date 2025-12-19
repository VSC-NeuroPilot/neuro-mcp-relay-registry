import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {toFetchResponse, toReqRes} from 'fetch-to-node';
import {McpRelayServer} from './routes/mcp';
import {PermissionMode} from "./routes/mcp/permissions";


// Initialize the relay server when the module loads
async function initializeRelayServer() {
    try {
        // Create relay server instance
        let relayServer = new McpRelayServer({
            name: "neuro-mcp-relay-registry",
            version: "0.0.1-beta",
            maxPending: 100,
            lockTimeout: 30000,
            toolSeparator: ":", // Use colon as separator for serverID:toolName
            defaultPermissionMode: 'copilot', // Default to copilot mode for security
        });

        // Initialize the relay server
        await relayServer.initialize();
        console.log(`[Server] Relay server initialized`);

        // Add any initial upstream servers here if needed
        // This could be configured via environment variables or a config file

        console.log(`[Server] MCP Relay server initialized successfully`);
        return relayServer;
    } catch (error) {
        console.error('[Server] Failed to initialize relay server:', error);
        throw error;
    }
}

const relayServer = await initializeRelayServer();
const permissionManager = relayServer.getPermissionManager()
const approvalQueue = permissionManager.getApprovalQueue()

const app = new Hono();

// Add CORS middleware
app.use('*', cors());

// ========== Relay server endpoints ==========

app.get('/health', async (c) => {
    try {
        const info = await relayServer.getInfo();
        const registry = relayServer.getRegistry();
        const stats = await registry.getStats();

        return c.json({
            status: "ok",
            ...info,
            servers: {
                total: stats.totalServers,
                connected: stats.connectedServers,
                disconnected: stats.disconnectedServers,
                errored: stats.erroredServers,
            },
        });
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.get('/stats', async (c) => {
    try {
        const registry = relayServer.getRegistry();
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

        return c.json({
            stats,
            servers: serverDetails.filter((s) => s !== null),
        });
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.post('/mcp', async (c) => {
    console.log(`[Server] Incoming MCP request from ${c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || c.req.raw.headers.get('X-Real-IP') || 'unknown'}`);
    const {req, res} = toReqRes(c.req.raw);

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
        await transport.handleRequest(req, res, await c.req.json());
        console.log(`[Relay Server] Request processed successfully`);

        res.on('close', () => {
            console.log('Request closed');
            transport.close();
            mcpServer.close();
        });

        return toFetchResponse(res);

    } catch (error) {
        console.error(`[Relay Server] Error handling MCP request:`, error);
        console.error(`[Relay Server] Error stack:`, String(error));
        return c.json({error: "Internal server error"});
    }
});


// ========== Permission Control Endpoints ==========

app.get('/api/permissions', async (c) => {
    try {
        const permissions = await permissionManager.getAllPermissions();
        const toolsWithPermissions = await permissionManager.getToolsWithPermissions();
        return c.json({
            configured: Array.from(permissions.entries()).map(([name, perm]) => ({
                toolName: name,
                mode: perm.mode,
                lastModified: perm.lastModified,
            })),
            allTools: toolsWithPermissions,
        });
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.put('/api/permissions/:toolName', async (c) => {
    const toolName = c.req.param('toolName');
    const {mode} = await c.req.json();

    if (!['auto', 'copilot', 'disabled'].includes(mode)) {
        return c.json({error: 'Invalid mode. Must be auto, copilot, or disabled'}, 400);
    }

    try {
        await permissionManager.updatePermission(toolName, mode as PermissionMode);
        return c.json({success: true, toolName, mode});
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.post('/api/permissions/batch', async (c) => {
    const {updates = {}} = await c.req.json();

    try {
        // Validate and convert to Map<string, PermissionMode>
        const mapUpdates = new Map<string, PermissionMode>();
        for (const [toolName, mode] of Object.entries(updates)) {
            if (!['auto', 'copilot', 'disabled'].includes(mode as string)) {
                return c.json({error: `Invalid mode for ${toolName}: ${mode}`}, 400);
            }
            mapUpdates.set(toolName, mode as PermissionMode);
        }

        await permissionManager.updatePermissions(mapUpdates);
        return c.json({success: true, count: mapUpdates.size});
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.get('/api/permissions/stats', async (c) => {
    try {
        const stats = await permissionManager.getStats();
        return c.json(stats);
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.get('/api/approvals/pending', async (c) => {
    try {
        const pending = approvalQueue.getPending();
        return c.json(pending);
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

app.post('/api/approvals/:approvalId/approve', async (c) => {
    if (!approvalQueue) {
        return c.json({error: 'Approval queue not available'}, 500);
    }

    const approvalId = c.req.param('approvalId');
    const {message} = await c.req.json();

    try {
        approvalQueue.approve(approvalId, message);
        return c.json({success: true, approvalId});
    } catch (error) {
        return c.json({error: String(error)}, 400);
    }
});

app.post('/api/approvals/:approvalId/reject', async (c) => {
    const approvalId = c.req.param('approvalId');
    const {message} = await c.req.json();

    try {
        approvalQueue.reject(approvalId, message);
        return c.json({success: true, approvalId});
    } catch (error) {
        return c.json({error: String(error)}, 400);
    }
});

app.get('/api/approvals/history', async (c) => {
    try {
        const history = approvalQueue.getHistory(100);
        return c.json(history);
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

// ========== Upstream Server Management Endpoints ==========

app.post('/api/servers/register', async (c) => {
    const registry = relayServer.getRegistry();
    const {serverId, clientConfig} = await c.req.json();

    if (!serverId || !clientConfig) {
        return c.json({error: 'Missing serverId or clientConfig'}, 400);
    }

    if (!clientConfig.transport || !clientConfig.serverUrl || !clientConfig.name) {
        return c.json({error: 'clientConfig requires transport, serverUrl, and name'}, 400);
    }

    try {
        const result = await registry.registerServer({
            serverId,
            clientConfig,
            autoConnect: true,
        });

        if (result.success && result.serverInfo) {
            console.log(`[Server] ${serverId} connected successfully`);
            return c.json({
                success: true,
                serverId,
                serverInfo: result.serverInfo
            });
        } else {
            return c.json({
                success: false,
                error: result.error || 'Registration failed'
            }, 500);
        }
    } catch (error) {
        console.error(`[Server] Failed to register ${serverId}:`, error);
        return c.json({error: String(error)}, 500);
    }
});

app.get('/api/servers', async (c) => {
    const registry = relayServer.getRegistry();

    try {
        const serverIds = await registry.listServers();
        const serverDetails = await Promise.all(
            serverIds.map(async (serverId) => {
                const server = await registry.getServer(serverId);
                if (!server) return null;

                const info = server.getInfo();
                return {
                    serverId,
                    name: info.name,
                    state: info.state,
                    connectedAt: info.connectedAt?.toISOString(),
                    error: info.error,
                };
            })
        );

        return c.json({
            servers: serverDetails.filter((s) => s !== null),
        });
    } catch (error) {
        return c.json({error: String(error)}, 500);
    }
});

export default app
