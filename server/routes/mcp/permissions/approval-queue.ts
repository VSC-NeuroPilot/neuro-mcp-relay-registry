import type {ApprovalRequest, ApprovalStatus, PendingApproval,} from './types';

/**
 * Event listener for approval queue changes
 */
type ApprovalListener = (approval: PendingApproval) => void;

/**
 * Manages the approval queue for copilot mode tool calls
 */
export class ApprovalQueue {
    private pending: Map<string, PendingApproval>;
    private history: PendingApproval[];
    private readonly historyMaxSize: number;
    private nextId: number;

    // Separate storage for non-serializable properties
    private resolvers: Map<string, (approved: boolean) => void>;
    private timeouts: Map<string, NodeJS.Timeout>;

    // Event listeners for real-time updates
    private readonly addedListeners: Set<ApprovalListener>;
    private readonly resolvedListeners: Set<ApprovalListener>;

    constructor(options?: { historyMaxSize?: number }) {
        this.pending = new Map();
        this.history = [];
        this.historyMaxSize = options?.historyMaxSize ?? 1000;
        this.nextId = 1;
        this.resolvers = new Map();
        this.timeouts = new Map();
        this.addedListeners = new Set();
        this.resolvedListeners = new Set();
    }

    /**
     * Request approval from user and wait for their decision
     * Returns true if approved, false if rejected/timeout/cancelled
     */
    async requestApproval(request: ApprovalRequest): Promise<boolean> {
        const id = this.generateId();

        // Create the pending approval (pure data object, no functions)
        const approval: PendingApproval = {
            id,
            type: request.type,
            toolName: request.toolName,
            serverId: request.serverId,
            originalToolName: request.originalToolName,
            args: request.args,
            response: request.response,
            createdAt: new Date(),
            expiresAt: request.timeout ? new Date(Date.now() + request.timeout) : undefined,
            status: 'pending',
        };

        // Create a promise that will be resolved when user approves/rejects
        const approvalPromise = new Promise<boolean>((resolve) => {
            // Store resolver separately (not on the approval object)
            this.resolvers.set(id, resolve);

            // Setup timeout if specified
            if (request.timeout) {
                const timeoutId = setTimeout(() => {
                    this.timeout(id);
                }, request.timeout);
                // Store timeout separately (not on the approval object)
                this.timeouts.set(id, timeoutId);
            }
        });

        // Add to pending queue
        this.pending.set(id, approval);

        // Notify listeners
        this.notifyAdded(approval);

        // Wait for approval/rejection
        return approvalPromise;
    }

    /**
     * Approve a pending approval
     */
    approve(approvalId: string, message?: string): void {
        const approval = this.pending.get(approvalId);
        if (!approval || approval.status !== 'pending') {
            throw new Error(`No pending approval found with id: ${approvalId}`);
        }

        this.resolve(approvalId, 'approved', true, message);
    }

    /**
     * Reject a pending approval
     */
    reject(approvalId: string, message?: string): void {
        const approval = this.pending.get(approvalId);
        if (!approval || approval.status !== 'pending') {
            throw new Error(`No pending approval found with id: ${approvalId}`);
        }

        this.resolve(approvalId, 'rejected', false, message);
    }

    /**
     * Cancel a pending approval (e.g., when tool is disabled)
     */
    cancel(approvalId: string, message?: string): void {
        const approval = this.pending.get(approvalId);
        if (!approval || approval.status !== 'pending') {
            return; // Already resolved or doesn't exist
        }

        this.resolve(approvalId, 'cancelled', false, message ?? 'Approval cancelled');
    }

    /**
     * Cancel all pending approvals for a specific tool
     */
    cancelForTool(toolName: string): void {
        const approvals = Array.from(this.pending.values()).filter(
            (a) => a.toolName === toolName && a.status === 'pending'
        );

        for (const approval of approvals) {
            this.cancel(approval.id, `Tool ${toolName} was disabled or permission changed`);
        }
    }

    /**
     * Get all pending approvals
     */
    getPending(): PendingApproval[] {
        return Array.from(this.pending.values()).filter((a) => a.status === 'pending');
    }

    /**
     * Get a specific approval by ID
     */
    getApproval(approvalId: string): PendingApproval | undefined {
        return this.pending.get(approvalId);
    }

    /**
     * Get approval history
     */
    getHistory(limit?: number): PendingApproval[] {
        const history = [...this.history];
        return limit ? history.slice(0, limit) : history;
    }

    /**
     * Clear approval history
     */
    clearHistory(): void {
        this.history = [];
    }

    /**
     * Subscribe to approval added events
     */
    onApprovalAdded(listener: ApprovalListener): () => void {
        this.addedListeners.add(listener);
        return () => this.addedListeners.delete(listener);
    }

    /**
     * Subscribe to approval resolved events
     */
    onApprovalResolved(listener: ApprovalListener): () => void {
        this.resolvedListeners.add(listener);
        return () => this.resolvedListeners.delete(listener);
    }

    /**
     * Get statistics about the approval queue
     */
    getStats() {
        const pending = this.getPending();
        return {
            pendingCount: pending.length,
            historyCount: this.history.length,
            totalProcessed: this.nextId - 1,
        };
    }

    // Private methods

    private generateId(): string {
        return `approval-${this.nextId++}`;
    }

    private timeout(approvalId: string): void {
        const approval = this.pending.get(approvalId);
        if (!approval || approval.status !== 'pending') {
            return; // Already resolved
        }

        this.resolve(approvalId, 'timeout', false, 'Approval timed out');
    }

    private resolve(
        approvalId: string,
        status: ApprovalStatus,
        approved: boolean,
        message?: string
    ): void {
        const approval = this.pending.get(approvalId);
        if (!approval) {
            return;
        }

        // Clear timeout if exists
        const timeoutId = this.timeouts.get(approvalId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.timeouts.delete(approvalId);
        }

        // Update approval
        approval.status = status;
        approval.resolvedAt = new Date();
        if (message) {
            approval.userMessage = message;
        }

        // Resolve the promise
        const resolver = this.resolvers.get(approvalId);
        if (resolver) {
            resolver(approved);
            this.resolvers.delete(approvalId);
        }

        // Move to history
        this.pending.delete(approvalId);
        this.addToHistory(approval);

        // Notify listeners
        this.notifyResolved(approval);
    }

    private addToHistory(approval: PendingApproval): void {
        this.history.unshift(approval); // Add to beginning

        // Trim history if too large
        if (this.history.length > this.historyMaxSize) {
            this.history = this.history.slice(0, this.historyMaxSize);
        }
    }

    private notifyAdded(approval: PendingApproval): void {
        for (const listener of this.addedListeners) {
            try {
                listener(approval);
            } catch (error) {
                console.error('Error in approval added listener:', error);
            }
        }
    }

    private notifyResolved(approval: PendingApproval): void {
        for (const listener of this.resolvedListeners) {
            try {
                listener(approval);
            } catch (error) {
                console.error('Error in approval resolved listener:', error);
            }
        }
    }
}
