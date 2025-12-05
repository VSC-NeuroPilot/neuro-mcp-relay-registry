import {BaseMcpClient} from "./base-client.js";
import {StdioMcpClientConfig} from "./types";

/**
 * STDIO MCP client implementation (placeholder).
 * TODO: Implement STDIO transport support
 */
export class StdioMcpClient extends BaseMcpClient {
    constructor(config: StdioMcpClientConfig) {
        super(config);
    }

    public async connectToServer(): Promise<void> {
        throw new Error('STDIO transport not yet implemented');
    }

    public async disconnectFromServer(): Promise<void> {
        throw new Error('STDIO transport not yet implemented');
    }

    public async callTool(): Promise<any> {
        throw new Error('STDIO transport not yet implemented');
    }

    public async refreshTools(): Promise<void> {
        throw new Error('STDIO transport not yet implemented');
    }
}
