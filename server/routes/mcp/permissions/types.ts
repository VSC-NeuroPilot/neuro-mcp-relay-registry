import type { McpToolCallResult } from '../clients/types';

/**
 * Permission modes for tool execution
 */
export type PermissionMode = 'auto' | 'copilot' | 'disabled';

/**
 * Copilot mode settings
 */
export interface CopilotSettings {
    /** Whether to require user approval before executing the tool */
    requireRequestApproval: boolean;

    /** Whether to require user approval before returning the tool result */
    requireResponseApproval: boolean;

    /** Optional timeout in milliseconds - auto-reject if not approved within this time */
    autoApproveAfterMs?: number;
}

/**
 * Permission configuration for a single tool
 */
export interface ToolPermission {
    /** Permission mode */
    mode: PermissionMode;

    /** Copilot mode settings (only relevant when mode is 'copilot') */
    copilot?: CopilotSettings;

    /** When this permission was last modified */
    lastModified: Date;

    /** Optional: who modified this permission (for future multi-user support) */
    modifiedBy?: string;
}

/**
 * Global permission configuration
 */
export interface PermissionConfig {
    /** Per-tool permissions (key: prefixed tool name like "server1:search") */
    tools: Map<string, ToolPermission>;

    /** Default permission mode for tools not explicitly configured */
    defaultMode: PermissionMode;

    /** Global settings */
    globalSettings: {
        /** Whether to allow tools that aren't explicitly configured */
        allowDynamicTools: boolean;

        /** Default copilot settings for new tools */
        defaultCopilotSettings: CopilotSettings;
    };
}

/**
 * Type of approval needed
 */
export type ApprovalType = 'request' | 'response';

/**
 * Status of a pending approval
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';

/**
 * Pending approval for a tool call
 */
export interface PendingApproval {
    /** Unique ID for this approval */
    id: string;

    /** Type of approval */
    type: ApprovalType;

    /** Tool information */
    toolName: string; // Prefixed name (e.g., "server1:search")
    serverId: string;
    originalToolName: string;

    /** Tool call arguments - user needs to see these before approving */
    args: Record<string, unknown>;

    /** For response approvals - the result to be approved */
    response?: McpToolCallResult;

    /** Timing information */
    createdAt: Date;
    expiresAt?: Date;

    /** Resolution status */
    status: ApprovalStatus;
    resolvedAt?: Date;

    /** Optional message from user when approving/rejecting */
    userMessage?: string;
}

/**
 * Request to create a pending approval
 */
export interface ApprovalRequest {
    type: ApprovalType;
    toolName: string;
    serverId: string;
    originalToolName: string;
    args: Record<string, unknown>;
    response?: McpToolCallResult;
    timeout?: number; // milliseconds
}

/**
 * Options for PermissionManager initialization
 */
export interface PermissionManagerOptions {
    /** Default permission mode for new tools */
    defaultMode?: PermissionMode;

    /** Lock timeout in milliseconds */
    lockTimeout?: number;

    /** Maximum pending lock requests */
    maxPending?: number;

    /** Maximum approval history size */
    historyMaxSize?: number;

    /** Default timeout for approvals in milliseconds */
    defaultApprovalTimeout?: number;
}

/**
 * Tool with its permission information
 */
export interface ToolWithPermission {
    toolName: string;
    serverId: string;
    originalToolName: string;
    serverName: string;
    permission: ToolPermission;
}
