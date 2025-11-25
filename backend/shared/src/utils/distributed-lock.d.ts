import Redis from 'ioredis';
declare const redis: Redis;
export declare class LockKeys {
    private static readonly ENV_PREFIX;
    static inventory(eventId: string, tierId: string): string;
    static listing(listingId: string): string;
    static ticket(ticketId: string): string;
    static userPurchase(userId: string): string;
    static reservation(reservationId: string): string;
    static payment(paymentId: string): string;
    static refund(paymentId: string): string;
}
interface LockOptions {
    service?: string;
    lockType?: string;
}
export declare function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>, options?: LockOptions): Promise<T>;
export declare function withLockRetry<T>(key: string, ttlMs: number, fn: () => Promise<T>, options?: LockOptions & {
    maxRetries?: number;
    backoffMultiplier?: number;
    initialDelayMs?: number;
}): Promise<T>;
export declare function tryLock(key: string, ttlMs: number): Promise<boolean>;
export declare class LockMetrics {
    private static lockAcquisitionTimes;
    private static lockWaitTimes;
    private static lockTimeouts;
    private static activeLocks;
    static startAcquisition(key: string): void;
    static endAcquisition(key: string): void;
    static releaseLock(key: string): void;
    static incrementTimeout(): void;
    static getMetrics(): {
        activeLockCount: number;
        totalTimeouts: number;
        averageWaitTime: number;
    };
    private static calculateAverageWaitTime;
}
export { redis as lockRedisClient };
export declare const redlock: null;
//# sourceMappingURL=distributed-lock.d.ts.map