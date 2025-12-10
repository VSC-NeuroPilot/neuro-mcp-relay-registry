/**
 * ServerRegistry is the central registry for managing upstream MCP server connections.
 *
 * Provides thread-safe operations for server lifecycle management with a two-level locking strategy:
 * - Level 1 (Registry): Read-Write lock for server list modifications
 * - Level 2 (Per-Server): Each ServerWrapper has its own mutex
 */

import type {McpToolCallResult} from '../clients/types';
import {createErrorToolCallResult} from '../clients/util';
import {McpClientFactory} from '../clients/factory';
import {AsyncRWLock} from './locks';
import {ServerWrapper} from './server-wrapper';
import type {AggregatedTool, RegistrationResult, RegistryStats, ServerRegistrationConfig,} from './types';

/**
 * Central registry for managing upstream MCP servers.
 *
 * Handles server registration, tool aggregation, and routing with proper concurrency control.
 *
 * @example
 * ```typescript
 * const registry = new ServerRegistry(1000, 30000);
 *
 * // Register a server
 * await registry.registerServer('server1', {
 *   transport: 'http',
 *   serverUrl: 'http://127.0.0.1:3001',
 *   name: 'My Server'
 * });
 *
 * // Get all tools
 * const tools = await registry.getAllTools();
 *
 * // Call a tool
 * const result = await registry.callTool('server1', 'search', { query: 'test' });
 *
 * // Unregister
 * await registry.unregisterServer('server1');
 * ```
 */
export class ServerRegistry {
    private readonly servers: Map<string, ServerWrapper>;
    private readonly serversLock: AsyncRWLock;
    private readonly maxPending: number;
    private readonly timeout: number;

    constructor(maxPending: number, timeout: number) {
        this.servers = new Map();
        this.maxPending = maxPending;
        this.timeout = timeout;
        this.serversLock = new AsyncRWLock(this.maxPending, this.timeout);
    }

    // ===== Server Management (write lock) =====

    /**
     * Register a new server in the registry.
     *
     * @param config - Server registration configuration
     * @returns Registration result with server info or error
     *
     * @example
     * ```typescript
     * const result = await registry.registerServer({
     *   serverId: 'server1',
     *   clientConfig: {
     *     transport: 'http',
     *     serverUrl: 'http://127.0.0.1:3001',
     *     name: 'My Server'
     *   },
     *   autoConnect: true
     * });
     * ```
     */
    public async registerServer(config: ServerRegistrationConfig): Promise<RegistrationResult> {
        const {serverId, clientConfig, autoConnect = true, metadata} = config;

        return this.serversLock.withWriteLock(async () => {
            // Check if server already exists
            if (this.servers.has(serverId)) {
                return {
                    success: false,
                    error: `Server with ID '${serverId}' is already registered`,
                };
            }

            try {
                const client = McpClientFactory.create(clientConfig);
                const wrapper = new ServerWrapper(serverId, client, this.maxPending, this.timeout, metadata);
                this.servers.set(serverId, wrapper);

                // Connect if requested, but we still have the write lock, so no one can see the server yet
                if (autoConnect) {
                    try {
                        await wrapper.connect();
                    } catch (error) {
                        // Connection failed, but server is still registered
                        // User can retry connection later
                        console.error(
                            `[ServerRegistry] Auto-connect failed for ${serverId}:`,
                            error
                        );
                    }
                }

                return {
                    success: true,
                    serverInfo: wrapper.getInfo(),
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Failed to register server: ${String(error)}`,
                };
            }
        });
    }

    /**
     * Unregister a server from the registry.
     *
     * @param serverId - ID of the server to unregister
     * @throws Error if server doesn't exist or unregistration fails
     *
     * @example
     * ```typescript
     * await registry.unregisterServer('server1');
     * ```
     */
    public async unregisterServer(serverId: string): Promise<void> {
        const wrapper = await this.serversLock.withReadLock(async () => {
            return this.servers.get(serverId);
        });

        if (typeof wrapper === 'undefined') {
            console.warn(`[ServerRegistry] Skipping ${serverId} because its wrapper can not be obtained.`);
            return;
        }

        // Remove from registry with write lock
        await this.serversLock.withWriteLock(async () => {
            this.servers.delete(serverId);
        });

        // Disconnect outside the write lock (so other operations can proceed)
        // The server is already removed from the registry, so no new operations will find it
        try {
            await wrapper.disconnect();
        } catch (error) {
            console.error(
                `[ServerRegistry] Error disconnecting server ${serverId}: ${String(error)}`,);
        }
    }

    // ===== Server Queries (read lock) =====

    /**
     * Get a server wrapper by ID.
     *
     * @param serverId - ID of the server
     * @returns Server wrapper or undefined if not found
     */
    public async getServer(serverId: string): Promise<ServerWrapper | undefined> {
        return this.serversLock.withReadLock(async () => {
            return this.servers.get(serverId);
        });
    }

    /**
     * Get all registered servers.
     *
     * @returns Read-only array of all server wrappers
     */
    public async getAllServers(): Promise<readonly ServerWrapper[]> {
        return this.serversLock.withReadLock(async () => {
            return Array.from(this.servers.values());
        });
    }

    /**
     * List all registered server IDs.
     *
     * @returns Array of server IDs
     */
    public async listServers(): Promise<readonly string[]> {
        return this.serversLock.withReadLock(async () => {
            return Array.from(this.servers.keys());
        });
    }

// ===== Tool Operations =====

    /**
     * Get all tools from all registered servers.
     *
     * @returns Array of aggregated tools with server source information
     *
     * @example
     * ```typescript
     * const tools = await registry.getAllTools();
     * // [
     * //   { name: 'search', serverId: 'server1', originalName: 'search', ... },
     * //   { name: 'fetch', serverId: 'server2', originalName: 'fetch', ... }
     * // ]
     * ```
     */
    public async getAllTools(): Promise<readonly AggregatedTool[]> {
        // Get snapshot of servers with read lock
        const servers = await this.serversLock.withReadLock(async () => {
            return Array.from(this.servers.values());
        });

        // Collect tools from each server (each server has its own lock)
        const allTools: AggregatedTool[] = [];

        for (const wrapper of servers) {
            const tools = wrapper.getTools();
            const serverId = wrapper.getServerId();
            const serverName = wrapper.getClient().serverName;

            for (const tool of tools) {
                allTools.push({
                    ...tool,
                    serverId,
                    originalName: tool.name,
                    serverName,
                });
            }
        }

        return allTools;
    }

    /**
     * Call a tool on a specific server.
     *
     * @param serverId - ID of the server to call the tool on
     * @param toolName - Name of the tool to call
     * @param args - Arguments to pass to the tool
     * @returns Tool execution result
     *
     * @example
     * ```typescript
     * const result = await registry.callTool('server1', 'search', {
     *   query: 'test'
     * });
     * ```
     */
    public async callTool(
        serverId: string,
        toolName: string,
        args?: Record<string, unknown>
    ): Promise<McpToolCallResult> {
        // Get server with read lock
        const wrapper = await this.serversLock.withReadLock(async () => {
            return this.servers.get(serverId);
        });

        if (!wrapper) {
            return createErrorToolCallResult(`Server '${serverId}' not found in registry`);
        }

        // Call tool (wrapper has its own lock)
        return wrapper.callTool(toolName, args);
    }

    // ===== Utility Methods =====
    /**
     * Check if a server is registered.
     *
     * @param serverId - ID of the server
     * @returns true if server is registered
     */
    public async hasServer(serverId: string): Promise<boolean> {
        return this.serversLock.withReadLock(async () => {
            return this.servers.has(serverId);
        });
    }

    /**
     * Get registry statistics.
     *
     * @returns Stats about registered servers and tools
     */
    public async getStats(): Promise<RegistryStats> {
        const servers = await this.getAllServers();

        let connectedServers = 0;
        let disconnectedServers = 0;
        let erroredServers = 0;
        let totalTools = 0;

        for (const wrapper of servers) {
            const state = wrapper.getState();

            if (state === 'connected') {
                connectedServers++;
            } else if (state === 'disconnected') {
                disconnectedServers++;
            } else if (state === 'error') {
                erroredServers++;
            }

            totalTools += wrapper.getTools().length;
        }

        return {
            totalServers: servers.length,
            connectedServers,
            disconnectedServers,
            erroredServers,
            totalTools,
        };
    }

    // ===== Lifecycle =====

    /**
     * Shutdown the registry and disconnect all servers.
     *
     * @example
     * ```typescript
     * await registry.shutdown();
     * ```
     */
    public async shutdown(): Promise<void> {
        // Get all servers with write lock
        const servers = await this.serversLock.withWriteLock(async () => {
            const allServers = Array.from(this.servers.values());
            this.servers.clear();
            return allServers;
        });

        // Disconnect all servers (outside the write lock)
        const disconnectPromises = servers.map(async (wrapper) => {
            try {
                await wrapper.disconnect();
            } catch (error) {
                console.error(
                    `[ServerRegistry] Error disconnecting ${wrapper.getServerId()}:`,
                    error
                );
            }
        });

        await Promise.all(disconnectPromises);
    }
}
