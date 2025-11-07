# mcp-relay-registry

This is the source code of a permission-based, easy-to-control MCP relay/registry server, both combined into one.
This server was created for use with (the official distributions of) both [NeuroPilot](https://github.com/VSC-NeuroPilot/neuropilot) and [NeuroMCP](https://github.com/ECHO-HELLO-WORLD424/NeuroMCP), two integrations for Neuro-sama (the AI streamer) that uses MCP.

## Setup

This README assumes you are setting up after cloning/downloading the repo directly.

<!--If you cannot be bothered to do all that, you can also [grab the latest release files from our Releases page](https://github.com/VSC-NeuroPilot/neuro-mcp-relay-registry) or [pull the Docker image from GHCR](https://vsc-neuropilot.github.io/neuro-mcp-relay-registry/setup/docker).-->

### Prerequisites

- Node.js v22 or higher
- An MCP client for usage
- A list of MCP servers to add!

### Start

1. After obtaining the repo, install dependencies using `pnpm`:

    ```sh
    pnpm install
    ```

2. Build the server:

    ```sh
    pnpm build
    ```

3. Start the server:

    ```sh
    node ./output/server/index.mjs
    ```

    This will start the server on port 3000.

## Interact

This server exposes 3 endpoints:

- `/` - Main landing page + dashboard (control panel here!)
- `/mcp` - MCP endpoint (connect your MCP client here!)
- `/registry` - Registry endpoint

Similar to the old permissions system in NeuroPilot, you can choose to allow or disallow a specific tool/server that you've connected.
