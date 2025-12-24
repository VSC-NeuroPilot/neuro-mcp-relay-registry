/**
 * Interactive CLI to test the permission system
 *
 * Usage: tsx example-permission-control-cli.ts [relay-server-url]
 * Example: tsx example-permission-control-cli.ts http://127.0.0.1:3100
 */

import * as readline from "readline";

const DEFAULT_RELAY_URL = "http://127.0.0.1:3100";

interface ToolPermission {
    toolName: string;
    serverId: string;
    originalToolName: string;
    serverName: string;
    permission: {
        mode: string;
        lastModified: string;
    };
}

interface PendingApproval {
    id: string;
    type: 'request' | 'response';
    toolName: string;
    serverId: string;
    originalToolName: string;
    args: Record<string, unknown>;
    response?: {
        success: boolean;
        result: any;
    };
    createdAt: string;
    expiresAt?: string;
    status: string;
}

class PermissionCLI {
    private readonly baseUrl: string;
    private rl: readline.Interface;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async checkConnection(): Promise<void> {
        console.log(`[Permission CLI] Connecting to relay server: ${this.baseUrl}`);
        try {
            await this.fetch('/health');
            console.log(`[Permission CLI] Connected successfully\n`);
        } catch (error) {
            console.error(`[Permission CLI] Failed to connect:`, error);
            throw error;
        }
    }

    async listPermissions(): Promise<void> {
        console.log("\n=== Tool Permissions ===\n");
        try {
            const data = await this.fetch('/api/permissions');
            const tools: ToolPermission[] = data.allTools;

            if (tools.length === 0) {
                console.log("No tools available");
                return;
            }

            // Group by server
            const byServer = new Map<string, ToolPermission[]>();
            for (const tool of tools) {
                if (!byServer.has(tool.serverId)) {
                    byServer.set(tool.serverId, []);
                }
                byServer.get(tool.serverId)!.push(tool);
            }

            // Display grouped by server
            for (const [serverId, serverTools] of byServer) {
                const serverName = serverTools[0]?.serverName || serverId;
                console.log(`\n${serverName} (${serverId}):`);
                for (const tool of serverTools) {
                    const modeIcon = {
                        'auto': '🟢',
                        'copilot': '🟡',
                        'disabled': '🔴'
                    }[tool.permission.mode] || '⚪';

                    console.log(`  ${modeIcon} ${tool.toolName.padEnd(40)} [${tool.permission.mode.toUpperCase()}]`);
                }
            }

            console.log(`\nTotal: ${tools.length} tools`);
            console.log(`Legend: 🟢 Auto  🟡 Copilot  🔴 Disabled\n`);
        } catch (error) {
            console.error("Failed to list permissions:", error);
        }
    }

    async updatePermission(toolName: string, mode: 'auto' | 'copilot' | 'disabled'): Promise<void> {
        try {
            await this.fetch(`/api/permissions/${encodeURIComponent(toolName)}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({mode})
            });
            console.log(`✓ Updated ${toolName} to ${mode.toUpperCase()} mode`);
        } catch (error) {
            console.error(`Failed to update permission:`, error);
        }
    }

    async viewPendingApprovals(): Promise<void> {
        console.log("\n=== Pending Approvals ===\n");
        try {
            const pending: PendingApproval[] = await this.fetch('/api/approvals/pending');

            if (pending.length === 0) {
                console.log("No pending approvals");
                return;
            }

            for (const approval of pending) {
                const typeIcon = approval.type === 'request' ? '📥' : '📤';
                console.log(`${typeIcon} ${approval.id}`);
                console.log(`   Tool: ${approval.toolName}`);
                console.log(`   Type: ${approval.type.toUpperCase()}`);
                console.log(`   Status: ${approval.status}`);
                console.log(`   Created: ${new Date(approval.createdAt).toLocaleString()}`);
                if (approval.expiresAt) {
                    console.log(`   Expires: ${new Date(approval.expiresAt).toLocaleString()}`);
                }

                if (approval.type === 'request') {
                    console.log(`   Arguments:`);
                    console.log(`   ${JSON.stringify(approval.args, null, 2).split('\n').join('\n   ')}`);
                } else if (approval.type === 'response' && approval.response) {
                    console.log(`   Response:`);
                    const responseStr = JSON.stringify(approval.response, null, 2);
                    const lines = responseStr.split('\n');
                    const preview = lines.slice(0, 20).join('\n   ');
                    console.log(`   ${preview}`);
                    if (lines.length > 20) {
                        console.log(`   ... (${lines.length - 20} more lines)`);
                    }
                }
                console.log();
            }

            console.log(`Total: ${pending.length} pending approval(s)\n`);
        } catch (error) {
            console.error("Failed to get pending approvals:", error);
        }
    }

    async approveApproval(approvalId: string, message?: string): Promise<void> {
        try {
            await this.fetch(`/api/approvals/${approvalId}/approve`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: message || 'Approved via CLI'})
            });
            console.log(`✓ Approved ${approvalId}`);
        } catch (error) {
            console.error(`Failed to approve:`, error);
        }
    }

    async rejectApproval(approvalId: string, message?: string): Promise<void> {
        try {
            await this.fetch(`/api/approvals/${approvalId}/reject`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: message || 'Rejected via CLI'})
            });
            console.log(`✓ Rejected ${approvalId}`);
        } catch (error) {
            console.error(`Failed to reject:`, error);
        }
    }

    async viewHistory(): Promise<void> {
        console.log("\n=== Approval History ===\n");
        try {
            const history: PendingApproval[] = await this.fetch('/api/approvals/history');

            if (history.length === 0) {
                console.log("No approval history");
                return;
            }

            for (const approval of history.slice(0, 20)) {
                const statusIcon = {
                    'approved': '✅',
                    'rejected': '❌',
                    'timeout': '⏱️',
                    'cancelled': '🚫'
                }[approval.status] || '⚪';

                const typeIcon = approval.type === 'request' ? '📥' : '📤';

                console.log(`${statusIcon} ${typeIcon} ${approval.toolName}`);
                console.log(`   ID: ${approval.id}`);
                console.log(`   Status: ${approval.status.toUpperCase()}`);
                console.log(`   Created: ${new Date(approval.createdAt).toLocaleString()}`);
                console.log();
            }

            console.log(`Showing last ${Math.min(20, history.length)} of ${history.length} approval(s)\n`);
        } catch (error) {
            console.error("Failed to get history:", error);
        }
    }

    async viewStats(): Promise<void> {
        console.log("\n=== Permission System Statistics ===\n");
        try {
            const stats = await this.fetch('/api/permissions/stats');

            console.log(`Total Configured Tools: ${stats.totalConfiguredTools}`);
            console.log(`  🟢 Auto Mode: ${stats.autoModeTools}`);
            console.log(`  🟡 Copilot Mode: ${stats.copilotModeTools}`);
            console.log(`  🔴 Disabled: ${stats.disabledTools}`);
            console.log(`\nDefault Mode: ${stats.defaultMode.toUpperCase()}`);
            console.log(`\nApproval Queue:`);
            console.log(`  Pending: ${stats.pendingCount}`);
            console.log(`  History: ${stats.historyCount}`);
            console.log(`  Total Processed: ${stats.totalProcessed}`);
            console.log();
        } catch (error) {
            console.error("Failed to get stats:", error);
        }
    }

    async interactiveMode(): Promise<void> {
        console.log("\n=== Interactive Permission Manager ===\n");
        console.log("Commands:");
        console.log("  list, l       - List all tool permissions");
        console.log("  pending, p    - View pending approvals");
        console.log("  approve <id>  - Approve a pending approval");
        console.log("  reject <id>   - Reject a pending approval");
        console.log("  set <tool> <mode> - Set permission mode (auto/copilot/disabled)");
        console.log("  history, h    - View approval history");
        console.log("  stats, s      - View statistics");
        console.log("  help          - Show this help");
        console.log("  quit, q       - Exit");
        console.log();

        while (true) {
            const input = await this.question("> ");
            const parts = input.trim().split(/\s+/);
            const command = parts[0]?.toLowerCase();

            if (!command) continue;

            try {
                switch (command) {
                    case 'list':
                    case 'l':
                        await this.listPermissions();
                        break;

                    case 'pending':
                    case 'p':
                        await this.viewPendingApprovals();
                        break;

                    case 'approve':
                        if (parts.length < 2) {
                            console.log("Usage: approve <approval-id> [message]");
                        } else {
                            const approvalId = parts[1];
                            const message = parts.slice(2).join(' ');
                            await this.approveApproval(approvalId, message);
                        }
                        break;

                    case 'reject':
                        if (parts.length < 2) {
                            console.log("Usage: reject <approval-id> [message]");
                        } else {
                            const approvalId = parts[1];
                            const message = parts.slice(2).join(' ');
                            await this.rejectApproval(approvalId, message);
                        }
                        break;

                    case 'set':
                        if (parts.length < 3) {
                            console.log("Usage: set <tool-name> <auto|copilot|disabled>");
                        } else {
                            const toolName = parts[1];
                            const mode = parts[2] as 'auto' | 'copilot' | 'disabled';
                            if (!['auto', 'copilot', 'disabled'].includes(mode)) {
                                console.log("Invalid mode. Must be: auto, copilot, or disabled");
                            } else {
                                await this.updatePermission(toolName, mode);
                            }
                        }
                        break;

                    case 'history':
                    case 'h':
                        await this.viewHistory();
                        break;

                    case 'stats':
                    case 's':
                        await this.viewStats();
                        break;

                    case 'help':
                        console.log("\nCommands:");
                        console.log("  list, l       - List all tool permissions");
                        console.log("  pending, p    - View pending approvals");
                        console.log("  approve <id>  - Approve a pending approval");
                        console.log("  reject <id>   - Reject a pending approval");
                        console.log("  set <tool> <mode> - Set permission mode");
                        console.log("  history, h    - View approval history");
                        console.log("  stats, s      - View statistics");
                        console.log("  help          - Show this help");
                        console.log("  quit, q       - Exit\n");
                        break;

                    case 'quit':
                    case 'q':
                    case 'exit':
                        console.log("Goodbye!");
                        this.rl.close();
                        return;

                    default:
                        console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
                }
            } catch (error) {
                console.error("Error:", error);
            }

            console.log();
        }
    }

    async run(): Promise<void> {
        try {
            await this.checkConnection();
            await this.interactiveMode();
        } catch (error) {
            console.error("Fatal error:", error);
            this.rl.close();
            process.exit(1);
        }
    }

    private async fetch(path: string, options?: RequestInit): Promise<any> {
        const url = new URL(path, this.baseUrl);
        const response = await fetch(url.toString(), options);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }
        return response.json();
    }

    private question(prompt: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }
}

async function main() {
    const relayUrl = process.argv[2] || DEFAULT_RELAY_URL;
    const cli = new PermissionCLI(relayUrl);
    await cli.run();
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
