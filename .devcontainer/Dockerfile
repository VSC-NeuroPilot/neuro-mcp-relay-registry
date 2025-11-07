FROM node:22

LABEL org.opencontainers.image.source="https://github.com/VSC-NeuroPilot/neuro-mcp-relay-registry"
LABEL org.opencontainers.image.description="Permissions-based MCP relay/registry server."
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /workspace

RUN npm install -g pnpm
RUN pnpm install
RUN pnpm -r build

EXPOSE 3000