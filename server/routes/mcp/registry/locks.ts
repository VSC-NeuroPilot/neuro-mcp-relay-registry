/**
 * 2 async locks for safe concurrent access to server resources:
 *
 * 1. AsyncRWLock - Read-Write lock allowing multiple concurrent readers OR a single writer
 * 2. AsyncMutex - Mutual exclusion lock allowing only one accessor at a time
 */

import AsyncLock from 'async-lock';

/**
 * Read-Write lock that allows multiple concurrent readers but only one writer.
 *
 * Rules:
 * - Multiple readers can hold the lock simultaneously
 * - Only one writer can hold the lock at a time
 * - Writers are exclusive with both readers and other writers
 *
 * @example
 * ```typescript
 * const rwLock = new AsyncRWLock();
 *
 * // Multiple readers can execute concurrently
 * await rwLock.withReadLock(async () => {
 *   return data.value;
 * });
 *
 * // Writers get exclusive access
 * await rwLock.withWriteLock(async () => {
 *   data.value = newValue;
 * });
 * ```
 */
export class AsyncRWLock {
    private readonly lock: AsyncLock;
    private readonly READ_KEY = 'read';
    private readonly WRITE_KEY = 'write';

    constructor(maxPending: number, timeout: number) {
        this.lock = new AsyncLock({
            maxPending: maxPending,
            timeout: timeout
        });
    }

    /**
     * Acquire a read lock and execute the given function.
     * Multiple readers can execute concurrently.
     *
     * @param fn - Async function to execute while holding the read lock
     * @returns The result of the function
     * @throws Error if lock acquisition times out
     */
    async withReadLock<T>(fn: () => Promise<T>): Promise<T> {
        return this.lock.acquire(this.READ_KEY, fn);
    }

    /**
     * Acquire a write lock and execute the given function.
     * Only one writer can execute at a time, and it's exclusive with all readers.
     *
     * @param fn - Async function to execute while holding the write lock
     * @returns The result of the function
     * @throws Error if lock acquisition times out
     */
    async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
        // Write locks are exclusive with both reads and other writes
        return this.lock.acquire([this.READ_KEY, this.WRITE_KEY], fn);
    }
}

/**
 * Mutual exclusion lock that allows only one accessor at a time.
 *
 * Use this for protecting operations that must be atomic or when you need to ensure serial execution of critical sections.
 *
 * @example
 * ```typescript
 * const mutex = new AsyncMutex();
 *
 * // Only one execution at a time
 * await mutex.withLock(async () => {
 *   // Critical section
 *   await doSomethingImportant();
 * });
 * ```
 */
export class AsyncMutex {
    private readonly lock: AsyncLock;
    private readonly KEY = 'mutex';

    constructor(maxPending: number, timeout: number) {
        this.lock = new AsyncLock({
            maxPending: maxPending,
            timeout: timeout
        });
    }

    /**
     * Acquire the mutex lock and execute the given function.
     *
     * @param fn - Async function to execute while holding the lock
     * @returns The result of the function
     * @throws Error if lock acquisition times out
     */
    async withLock<T>(fn: () => Promise<T>): Promise<T> {
        return this.lock.acquire(this.KEY, fn);
    }
}
