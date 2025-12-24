/**
 * Interactive CLI to test the relay server by calling tools
 *
 * Usage: tsx example-mcp-tool-call-cli.ts [relay-server-url]
 * Example: tsx example-mcp-tool-call-cli.ts http://127.0.0.1:3100
 */

import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as readline from "readline";

const DEFAULT_RELAY_URL = "http://localhost:3100";

interface Tool {
    name: string;
    description?: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, any>;
        required?: string[];
    };
}

class ExampleMcpToolCallCli {
    private readonly client: Client;
    private transport: StreamableHTTPClientTransport | null = null;
    private tools: Tool[] = [];
    private rl: readline.Interface;
    private readonly relayUrl: string;

    constructor(relayUrl: string) {
        this.relayUrl = relayUrl;
        this.client = new Client({
            name: "test-cli",
            version: "0.0.1"
        }, {
            capabilities: {}
        });

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async connect(): Promise<void> {
        console.log(`[CLI] Connecting to relay server: ${this.relayUrl}`);

        const url = new URL("/mcp", this.relayUrl);
        this.transport = new StreamableHTTPClientTransport(url);

        try {
            await this.client.connect(this.transport);
            console.log(`[CLI] Connected to relay server`);

            await this.loadTools();
        } catch (error) {
            console.error(`[CLI] Failed to connect:`, error);
            throw error;
        }
    }

    async loadTools(): Promise<void> {
        try {
            const response = await this.client.listTools();
            this.tools = response.tools;
            console.log(`[CLI] Loaded ${this.tools.length} tools\n`);
        } catch (error) {
            console.error(`[CLI] Failed to load tools:`, error);
            throw error;
        }
    }

    listTools(): void {
        if (this.tools.length === 0) {
            console.log("No tools available");
            return;
        }

        console.log("\n=== Available Tools ===\n");

        // Group tools by server prefix
        const groupedTools = new Map<string, Tool[]>();
        this.tools.forEach((tool) => {
            const parts = tool.name.split(":");
            const serverPrefix = parts.length > 1 ? parts[0] : "local";
            if (!groupedTools.has(serverPrefix)) {
                groupedTools.set(serverPrefix, []);
            }
            groupedTools.get(serverPrefix)!.push(tool);
        });

        // Display tools grouped by server
        for (const [serverPrefix, tools] of groupedTools.entries()) {
            console.log(`From ${serverPrefix}:`);
            tools.forEach((tool, index) => {
                const parts = tool.name.split(":");
                parts.length > 1 ? parts.slice(1).join(":") : tool.name;
                console.log(`  ${index + 1}. ${tool.name}`);
                if (tool.description) {
                    console.log(`     Description: ${tool.description}`);
                }
                if (tool.inputSchema.properties) {
                    const props = Object.keys(tool.inputSchema.properties);
                    console.log(`     Parameters: ${props.join(", ") || "none"}`);
                    if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
                        console.log(`     Required: ${tool.inputSchema.required.join(", ")}`);
                    }
                }
            });
            console.log();
        }
    }

    async callTool(toolName: string, args: Record<string, unknown>): Promise<void> {
        console.log(`\n[CLI] Calling tool: ${toolName}`);
        console.log(`[CLI] Arguments:`, JSON.stringify(args, null, 2));

        try {
            const result = await this.client.callTool({
                name: toolName,
                arguments: args
            });

            console.log(`\n[CLI] Tool call succeeded`);
            console.log(`[CLI] Result:`, JSON.stringify(result, null, 2));

            if (result.content) {
                console.log("\n=== Tool Output ===");
                // @ts-ignore
                result.content.forEach((content: { type: string; text: any; }) => {
                    if (content.type === "text") {
                        console.log(content.text);
                    } else {
                        console.log(JSON.stringify(content, null, 2));
                    }
                });
            }

            if (result.isError) {
                console.log("\nTool reported an error");
            }
        } catch (error) {
            console.error(`\n[CLI] Tool call failed:`, error);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            console.log("\n[CLI] Disconnected");
        }
    }

    async interactiveMode(): Promise<void> {
        console.log("\n=== Interactive Mode ===");
        console.log("Commands:");
        console.log("  list                    - List all available tools");
        console.log("  call <tool-name>        - Call a tool (using full prefixed name, e.g., server1:toolName)");
        console.log("  exit                    - Exit the CLI\n");

        while (true) {
            const input = await this.question("> ");
            const parts = input.trim().split(/\s+/);
            const command = parts[0]?.toLowerCase();

            if (!command) continue;

            switch (command) {
                case "exit":
                case "quit":
                    return;

                case "list":
                    this.listTools();
                    break;

                case "call":
                    if (parts.length < 2) {
                        console.log("Usage: call <tool-name>");
                        break;
                    }
                    const toolName = parts.slice(1).join(" ");
                    const tool = this.tools.find(t => t.name === toolName);

                    if (!tool) {
                        console.log(`Tool "${toolName}" not found. Use 'list' to see available tools.`);
                        break;
                    }

                    // Collect arguments
                    const args: Record<string, unknown> = {};
                    if (tool.inputSchema.properties) {
                        console.log("\nEnter arguments (press Enter to skip optional parameters):");

                        for (const [paramName, paramSchema] of Object.entries(tool.inputSchema.properties)) {
                            const isRequired = tool.inputSchema.required?.includes(paramName) ?? false;
                            const requiredMarker = isRequired ? " (required)" : " (optional)";
                            const description = (paramSchema as any).description || "";
                            const typeInfo = (paramSchema as any).type || "any";

                            const value = await this.question(`  ${paramName}${requiredMarker} [${typeInfo}]${description ? ` - ${description}` : ""}: `);

                            if (value.trim()) {
                                // Try to parse as JSON, otherwise use as string
                                try {
                                    args[paramName] = JSON.parse(value);
                                } catch {
                                    args[paramName] = value;
                                }
                            } else if (isRequired) {
                                console.log(`${paramName} is required`);
                                break;
                            }
                        }
                    }

                    await this.callTool(toolName, args);
                    break;

                case "help":
                    console.log("\nCommands:");
                    console.log("  list                    - List all available tools");
                    console.log("  call <tool-name>        - Call a tool (using full prefixed name, e.g., server1:toolName)");
                    console.log("  exit                    - Exit the CLI");
                    break;

                default:
                    console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
            }
        }
    }

    close(): void {
        this.rl.close();
    }

    private question(prompt: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }
}

async function main() {
    const relayUrl = process.argv[2] || DEFAULT_RELAY_URL;

    console.log("=== MCP Relay Test CLI ===\n");

    const cli = new ExampleMcpToolCallCli(relayUrl);

    try {
        await cli.connect();
        cli.listTools();
        await cli.interactiveMode();
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    } finally {
        await cli.disconnect();
        cli.close();
    }
}

main();
