/**
 * ServerWrapper wraps a BaseMcpClient with per-server locking and lifecycle management.
 *
 * Provides thread-safe access to individual upstream MCP servers.
 */

import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {BaseMcpClient} from '../clients/base-client';
import type {ConnectionState, McpToolCallResult, ServerInfo} from '../clients/types';
import {createErrorToolCallResult} from '../clients/util';
import {AsyncMutex} from './locks';

/**
 * Wraps an MCP client with per-server locking and state management.
 *
 * All operations that modify server state or invoke tools are protected by a mutex,
 * ensuring thread-safe access even when multiple tool calls or management operations
 * occur concurrently.
 *
 * @example
 * ```typescript
 * const client = McpClientFactory.create({...});
 * const wrapper = new ServerWrapper('server1', client);
 *
 * await wrapper.connect();
 * const result = await wrapper.callTool('search', { query: 'test' });
 * await wrapper.disconnect();
 * ```
 */
export class ServerWrapper {
    private readonly serverId: string;
    private readonly client: BaseMcpClient;
    private readonly lock: AsyncMutex;
    private state: ConnectionState;
    private error?: string;
    private connectedAt?: Date;
    private readonly metadata: Record<string, unknown>;

    constructor(serverId: string, client: BaseMcpClient, maxPending: number, timeout: number, metadata?: Record<string, unknown>) {
        this.serverId = serverId;
        this.client = client;
        this.lock = new AsyncMutex(maxPending, timeout);
        this.state = 'disconnected';
        this.metadata = metadata ?? {};
    }

    // ===== Getters (no lock needed - read-only snapshots) =====

    /**
     * Get the server ID.
     */
    public getServerId(): string {
        return this.serverId;
    }

    /**
     * Get the underlying client (use with caution - bypasses locking).
     */
    public getClient(): BaseMcpClient {
        return this.client;
    }

    /**
     * Get current connection state (snapshot).
     */
    public getState(): ConnectionState {
        return this.state;
    }

    /**
     * Get server information including state and metadata.
     */
    public getInfo(): ServerInfo {
        return {
            id: this.serverId,
            name: this.client.serverName,
            state: this.state,
            toolCount: this.client.availableTools.length,
            connectedAt: this.connectedAt,
            error: this.error,
            metadata: {...this.metadata},
            config: this.client.getConfig()
        };
    }

    /**
     * Get available tools (snapshot).
     * Note: Returns cached tool list without lock for performance.
     * Use refreshTools() to update the cache.
     */
    public getTools(): readonly Tool[] {
        return this.client.availableTools;
    }

// ===== Lifecycle Operations (all acquire lock) =====

    /**
     * Connect to the upstream MCP server.
     *
     * @throws Error if connection fails
     */
    public async connect(): Promise<void> {
        return this.lock.withLock(async () => {
            if (this.state === 'connected' || this.state === 'connecting') {
                console.warn(`Skipping connecting to server ${this.serverId} because it is ${this.state}`);
                return;
            }

            try {
                this.state = 'connecting';
                this.error = undefined;

                await this.client.connectToServer();

                this.state = 'connected';
                this.connectedAt = new Date();
            } catch (error) {
                this.state = 'error';
                this.error = String(error);
                throw new Error(`Failed to connect to server ${this.serverId}: ${this.error}`);
            }
        });
    }

    /**
     * Disconnect from the upstream MCP server.
     *
     * @throws Error if disconnection fails
     */
    public async disconnect(): Promise<void> {
        return this.lock.withLock(async () => {
            if (this.state === 'disconnected' || this.state === 'disconnecting') {
                console.warn(`Skipping disconnecting to server ${this.serverId} because it is ${this.state}`);
                return;
            }
            try {
                this.state = 'disconnecting';

                await this.client.disconnectFromServer();

                this.state = 'disconnected';
                this.connectedAt = undefined;
            } catch (error) {
                this.state = 'error';
                this.error = String(error);

                // Still try to clean up state even if disconnect failed
                this.connectedAt = undefined;

                throw new Error(
                    `Failed to disconnect from server ${this.serverId}: ${this.error}`
                );
            }
        });
    }

    /**
     * Refresh the tool list from the upstream server.
     *
     * @throws Error if refresh fails or server is not connected
     */
    public async refreshTools(): Promise<void> {
        return this.lock.withLock(async () => {
            if (this.state !== 'connected') {
                throw new Error(`Cannot refresh tools for server ${this.serverId}: not connected (state: ${this.state})`);
            }

            try {
                await this.client.refreshTools();
            } catch (error) {
                this.error = String(error);
                throw new Error(`Failed to refresh tools for server ${this.serverId}: ${this.error}`);
            }
        });
    }

    // ===== Tool Operations (acquire lock) =====

    /**
     * Call a tool on the upstream server.
     *
     * @param toolName - Name of the tool to call
     * @param args - Arguments to pass to the tool
     * @returns Tool execution result
     * @throws Error if server is not connected or tool call fails
     */
    public async callTool(
        toolName: string,
        args?: Record<string, unknown>
    ): Promise<McpToolCallResult> {
        return this.lock.withLock(async () => {
            if (this.state !== 'connected') {
                return createErrorToolCallResult(`Server ${this.serverId} is not connected (state: ${this.state})`);
            }

            try {
                const result = await this.client.callTool(toolName, args);

                // Update error state if tool call had issues but didn't throw
                if (!result.success) {
                    this.error = `Tool call failed: ${toolName}`;
                }

                return result;
            } catch (error) {
                this.error = String(error);
                return createErrorToolCallResult(`Tool call failed on server ${this.serverId}: ${this.error}`);
            }
        });
    }
}
