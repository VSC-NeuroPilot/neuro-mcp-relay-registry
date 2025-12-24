# neuro-mcp-relay-registry

A permissions-based, controllable MCP Relay & Registry.
Created for use with NeuroPilot and NeuroMCP, meant for anyone and everyone to use.

## Usage

You can find the docs at [our GitHub Pages link](https://vsc-neuropilot.github.io/neuro-mcp-relay-registry) or start the docs preview server included in the container build.

## API Endpoints

### MCP Protocol

- `POST /mcp` - Main MCP endpoint for tool calls and communication with downstream clients

### Permission Management

- `GET /api/permissions` - List all tool permissions and configurations
- `PUT /api/permissions/:toolName` - Update permission for a specific tool
    - Request body: `{ "mode": "auto" | "copilot" | "disabled" }`
- `POST /api/permissions/batch` - Update permissions for multiple tools
    - Request body: `{ "updates": { "toolName": "mode" } }`
- `GET /api/permissions/stats` - Get permission system statistics

### Approval Queue

- `GET /api/approvals/pending` - List pending approval requests
- `POST /api/approvals/:approvalId/approve` - Approve a pending request
    - Request body: `{ "message": "optional approval message" }`
- `POST /api/approvals/:approvalId/reject` - Reject a pending request
    - Request body: `{ "message": "optional rejection message" }`
- `GET /api/approvals/history` - Get approval history

### Server Management

- `POST /api/servers/register` - Register a new upstream server
    - Request body: `{ "serverId": "server1", "clientConfig": { "transport": "http", "serverUrl": "http://127.0.0.1:3001", "name": "Server 1" } }`
- `GET /api/servers` - List all registered upstream servers

### Health & Monitoring

- `GET /health` - Health check and server information
- `GET /stats` - Detailed server statistics and connection information
