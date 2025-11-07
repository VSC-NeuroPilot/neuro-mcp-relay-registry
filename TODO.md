# To-do list

## MVP (v1 release)

- [ ] Support Streamable HTTP servers
- [ ] Support legacy SSE servers
- [ ] Support STDIO servers
- [ ] Add toggles for exposing MCP servers via both endpoints
- [ ] Allow import from other MCP config sources (e.g. Claude, Cursor, VS Code)
- [ ] Support authorization mechanisms.
- [ ] Add an option to permanently store config on disk (realistically using Nitro's KV/DB Storage layer)
- [ ] Invocation logs
- [ ] Docker images (published on GHCR and/or Docker Hub) for process isolation with (mainly) STDIO servers

## Post-v1

- Version docs on Starlight (using Starlight Versions plugin)
- Export formats (could make our own format that also shows if servers are enabled and where)
- SSR the site? It shouldn't be too much of a difference but it can allow for some interesting stuff there
- Allow separate toggles for Relay & Registry endpoint exposure
- Multiple saved presets/configs
- Allow differentiating groups using query parameters (also allows hosting a "public" instance. Maybe?)
- JSON API (probably via OpenAPI?) to control the server programmatically
- Search other registries/auto-inherit from configured registries
- Server chaining support
- Downstream integration testing using NeuroPilot and NeuroMCP
- (unknown if feasible) Have one or more solutions for sandboxing built-in to the server
- (unknown if possible) Copilot mode for "asynchronously" returning results
