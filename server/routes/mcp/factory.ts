import {BaseMcpClient} from "./clients/base-client";
import {StreamableHttpMcpClient} from "./clients/http";
import {SseMcpClient} from "./clients/sse";
import {StdioMcpClient} from "./clients/stdio";
import type {HttpMcpClientConfig, McpClientConfig, SseMcpClientConfig, StdioMcpClientConfig} from "./clients/types";

/**
 * Factory for creating MCP clients based on transport type.
 * Provides a unified way to instantiate different client implementations.
 */
export class McpClientFactory {
    /**
     * Create an MCP client based on the provided configuration.
     *
     * @param config - Client configuration specifying transport type and options
     * @returns Configured MCP client instance
     * @throws Error if transport type is not supported
     *
     * @example
     * ```typescript
     * // Create HTTP client
     * const httpClient = McpClientFactory.create({
     *   transport: 'http',
     *   serverUrl: 'http://localhost:3000',
     *   name: 'My HTTP Server'
     * });
     *
     * // Create STDIO client
     * const stdioClient = McpClientFactory.create({
     *   transport: 'stdio',
     *   command: 'npx',
     *   args: ['-y', '@modelcontextprotocol/server-everything'],
     *   name: 'Everything Server'
     * });
     * ```
     */
    public static create(config: McpClientConfig): BaseMcpClient {
        switch (config.transport) {
            case 'http':
                return new StreamableHttpMcpClient(config as HttpMcpClientConfig);

            case 'sse':
                return new SseMcpClient(config as SseMcpClientConfig);

            case 'stdio':
                return new StdioMcpClient(config as StdioMcpClientConfig);

            default:
                // TypeScript exhaustiveness check
                throw new Error(`Unsupported transport type: ${(config as McpClientConfig).transport}`);
        }
    }

    /**
     * Create multiple clients from an array of configurations.
     *
     * @param configs - Array of client configurations
     * @returns Array of configured client instances
     *
     * @example
     * ```typescript
     * const clients = McpClientFactory.createMultiple([
     *   { transport: 'http', serverUrl: 'http://localhost:3000' },
     *   { transport: 'stdio', command: 'node', args: ['server.js'] }
     * ]);
     * ```
     */
    public static createMultiple(configs: McpClientConfig[]): BaseMcpClient[] {
        return configs.map(config => this.create(config));
    }
}
