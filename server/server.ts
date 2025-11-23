import { Hono } from 'hono';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// #region MCP Server

const mcp = new McpServer({
  name: 'neuro-mcp-relay-registry',
  version: '0.0.1-beta'
})

// #endregion

// #region Hono app

const app = new Hono();

app.post('/mcp', (c) => {
  return c.text('Streamable HTTP MCP not yet implemented.')
})

app.post('/sse', (c) => {
  return c.text('Legacy SSE not implemented.')
})

// #endregion

export default app
