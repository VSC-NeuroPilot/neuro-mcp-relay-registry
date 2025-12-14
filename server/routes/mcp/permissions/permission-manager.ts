import type {AggregatedTool} from '../registry';
import {AsyncRWLock} from '../registry';
import {ApprovalQueue} from './approval-queue';
import type {
    PermissionConfig,
    PermissionManagerOptions,
    PermissionMode,
    ToolPermission,
    ToolWithPermission,
} from './types';
import type {McpToolCallResult} from '../clients/types';
import {createErrorToolCallResult} from '../clients/util';
import type {ToolRouter} from '../router';

/**
 * PermissionManager provides fine-grained control over tool execution
 * with support for auto and copilot modes.
 *
 * Level 3 Locking: Uses AsyncRWLock for permission configuration
 * - Read locks: Multiple concurrent permission checks (frequent)
 * - Write locks: Exclusive permission updates (infrequent)
 */
export class PermissionManager {
    private readonly permissionLock: AsyncRWLock;
    private readonly config: PermissionConfig;
    private readonly approvalQueue: ApprovalQueue;
    private readonly router: ToolRouter;
    private readonly defaultApprovalTimeout: number;

    constructor(router: ToolRouter, options?: PermissionManagerOptions) {
        this.router = router;
        this.permissionLock = new AsyncRWLock(options?.maxPending ?? 1000, options?.lockTimeout ?? 30000,);

        // Initialize configuration with safe defaults
        this.config = {
            tools: new Map(),
            defaultMode: options?.defaultMode ?? 'copilot', // Safe default
            globalSettings: {
                allowDynamicTools: true,
                defaultCopilotSettings: {
                    requireRequestApproval: true,
                    requireResponseApproval: true,
                    autoApproveAfterMs: options?.defaultApprovalTimeout,
                },
            },
        };

        this.approvalQueue = new ApprovalQueue({
            historyMaxSize: options?.historyMaxSize ?? 1000,
        });

        this.defaultApprovalTimeout = options?.defaultApprovalTimeout ?? 300000; // 5 minutes
    }

    /**
     * Check permission for a tool (with read lock)
     */
    async checkPermission(toolName: string): Promise<ToolPermission> {
        return this.permissionLock.withReadLock(async () => {
            const permission = this.config.tools.get(toolName);
            if (permission) {
                return permission;
            }

            // Return default permission for unconfigured tools
            return this.getDefaultPermission();
        });
    }

    /**
     * Update permission for a specific tool (with write lock)
     */
    async updatePermission(toolName: string, mode: PermissionMode): Promise<void> {
        return this.permissionLock.withWriteLock(async () => {
            const permission: ToolPermission = {
                mode,
                copilot:
                    mode === 'copilot'
                        ? {...this.config.globalSettings.defaultCopilotSettings}
                        : undefined,
                lastModified: new Date(),
            };

            this.config.tools.set(toolName, permission);

            // Cancel pending approvals if tool is disabled
            if (mode === 'disabled') {
                this.approvalQueue.cancelForTool(toolName);
            }
        });
    }

    /**
     * Batch update permissions for multiple tools (with write lock)
     */
    async updatePermissions(updates: Map<string, PermissionMode>): Promise<void> {
        return this.permissionLock.withWriteLock(async () => {
            const now = new Date();
            const disabledTools: string[] = [];

            for (const [toolName, mode] of updates) {
                const permission: ToolPermission = {
                    mode,
                    copilot:
                        mode === 'copilot'
                            ? {...this.config.globalSettings.defaultCopilotSettings}
                            : undefined,
                    lastModified: now,
                };

                this.config.tools.set(toolName, permission);

                if (mode === 'disabled') {
                    disabledTools.push(toolName);
                }
            }

            // Cancel pending approvals for disabled tools
            for (const toolName of disabledTools) {
                this.approvalQueue.cancelForTool(toolName);
            }
        });
    }

    /**
     * Reset permission to default (with write lock)
     */
    async resetPermission(toolName: string): Promise<void> {
        return this.permissionLock.withWriteLock(async () => {
            this.config.tools.delete(toolName);
        });
    }

    /**
     * Get all permissions (with read lock)
     */
    async getAllPermissions(): Promise<Map<string, ToolPermission>> {
        return this.permissionLock.withReadLock(async () => {
            return new Map(this.config.tools);
        });
    }

    /**
     * Get default permission settings
     */
    getDefaultPermission(): ToolPermission {
        return {
            mode: this.config.defaultMode,
            copilot:
                this.config.defaultMode === 'copilot'
                    ? {...this.config.globalSettings.defaultCopilotSettings}
                    : undefined,
            lastModified: new Date(),
        };
    }

    /**
     * Update default permission mode (with write lock)
     */
    async updateDefaultMode(mode: PermissionMode): Promise<void> {
        return this.permissionLock.withWriteLock(async () => {
            this.config.defaultMode = mode;
        });
    }

    /**
     * Execute a tool with permission checks and approval workflow
     * This is the main entry point for tool execution
     */
    async executeTool(
        toolName: string,
        args?: Record<string, unknown>
    ): Promise<McpToolCallResult> {
        // Check permission (with read lock)
        const permission = await this.checkPermission(toolName);

        // Handle based on permission mode
        if (permission.mode === 'disabled') {
            return createErrorToolCallResult(`Tool '${toolName}' is disabled`);
        }

        if (permission.mode === 'auto') {
            // Direct execution without approval
            return this.router.callTool(toolName, args);
        }

        // Copilot mode - requires approval workflow
        return this.executeInCopilotMode(toolName, args, permission);
    }

    /**
     * Filter tools based on permissions (with read lock)
     * Only returns tools that are not disabled
     */
    async filterEnabledTools(tools: readonly AggregatedTool[]): Promise<AggregatedTool[]> {
        return this.permissionLock.withReadLock(async () => {
            return tools.filter((tool) => {
                const permission = this.getPermissionUnsafe(tool.name);
                return permission.mode !== 'disabled';
            });
        });
    }

    /**
     * Get all tools with their permission information (with read lock)
     */
    async getToolsWithPermissions(): Promise<ToolWithPermission[]> {
        return this.permissionLock.withReadLock(async () => {
            const tools = await this.router.listAllTools();

            return tools.map((tool) => ({
                toolName: tool.name,
                serverId: tool.serverId,
                originalToolName: tool.originalName,
                serverName: tool.serverName,
                permission: this.getPermissionUnsafe(tool.name),
            }));
        });
    }

    /**
     * Get the approval queue for managing pending approvals
     */
    getApprovalQueue(): ApprovalQueue {
        return this.approvalQueue;
    }

    /**
     * Get statistics about the permission system
     */
    async getStats() {
        return this.permissionLock.withReadLock(async () => {
            const approvalStats = this.approvalQueue.getStats();

            let autoCount = 0;
            let copilotCount = 0;
            let disabledCount = 0;

            for (const permission of this.config.tools.values()) {
                switch (permission.mode) {
                    case 'auto':
                        autoCount++;
                        break;
                    case 'copilot':
                        copilotCount++;
                        break;
                    case 'disabled':
                        disabledCount++;
                        break;
                }
            }

            return {
                totalConfiguredTools: this.config.tools.size,
                autoModeTools: autoCount,
                copilotModeTools: copilotCount,
                disabledTools: disabledCount,
                defaultMode: this.config.defaultMode,
                ...approvalStats,
            };
        });
    }

    /**
     * Get permission for a tool without locking (internal use)
     */
    private getPermissionUnsafe(toolName: string): ToolPermission {
        return this.config.tools.get(toolName) ?? this.getDefaultPermission();
    }

    /**
     * Execute tool in copilot mode with approval workflow
     */
    private async executeInCopilotMode(
        toolName: string,
        args: Record<string, unknown> | undefined,
        permission: ToolPermission
    ): Promise<McpToolCallResult> {
        // Parse tool name to get server info
        const parsed = this.parseToolName(toolName);
        if (!parsed) {
            return createErrorToolCallResult(`Invalid tool name format: ${toolName}`);
        }

        const {serverId, originalToolName} = parsed;
        const normalizedArgs = args ?? {};

        // Step 1: Request approval (if required)
        if (permission.copilot?.requireRequestApproval) {
            const approved = await this.approvalQueue.requestApproval({
                type: 'request',
                toolName,
                serverId,
                originalToolName,
                args: normalizedArgs,
                timeout: permission.copilot.autoApproveAfterMs ?? this.defaultApprovalTimeout,
            });

            if (!approved) {
                return createErrorToolCallResult('Tool call request was rejected');
            }
        }

        // Step 2: Execute the tool
        let result: McpToolCallResult;
        try {
            result = await this.router.callTool(toolName, args);
        } catch (error) {
            return createErrorToolCallResult(
                `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        // Step 3: Response approval (if required)
        if (permission.copilot?.requireResponseApproval) {
            const approved = await this.approvalQueue.requestApproval({
                type: 'response',
                toolName,
                serverId,
                originalToolName,
                args: normalizedArgs,
                response: result,
                timeout: permission.copilot.autoApproveAfterMs ?? this.defaultApprovalTimeout,
            });

            if (!approved) {
                return createErrorToolCallResult('Tool call response was rejected');
            }
        }

        return result;
    }

    /**
     * Parse a prefixed tool name
     * Returns null if parsing fails
     */
    private parseToolName(toolName: string): { serverId: string; originalToolName: string } | null {
        // Simple parsing - expects format "serverId:toolName"
        const separatorIndex = toolName.indexOf(':');
        if (separatorIndex === -1) {
            return null;
        }

        const serverId = toolName.substring(0, separatorIndex);
        const originalToolName = toolName.substring(separatorIndex + 1);

        if (!serverId || !originalToolName) {
            return null;
        }

        return {serverId, originalToolName};
    }
}
