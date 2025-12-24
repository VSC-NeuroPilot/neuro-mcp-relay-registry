import { BaseMcpClient } from './base-client';
import type { SseMcpClientConfig } from './types';

/**
 * SSE MCP client implementation (placeholder).
 * TODO: Implement SSE transport support
 */
export class SseMcpClient extends BaseMcpClient {
    constructor(config: SseMcpClientConfig) {
        super(config);
    }

    public async connectToServer(): Promise<void> {
        throw new Error('SSE transport not yet implemented');
    }

    public async disconnectFromServer(): Promise<void> {
        throw new Error('SSE transport not yet implemented');
    }

    public async callTool(): Promise<any> {
        throw new Error('SSE transport not yet implemented');
    }

    public async refreshTools(): Promise<void> {
        throw new Error('SSE transport not yet implemented');
    }
}
