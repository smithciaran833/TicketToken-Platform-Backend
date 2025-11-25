import { CacheConfig } from './cache-config';
export type CacheLevel = 'L1' | 'L2' | 'BOTH';
export type CacheStrategy = 'cache-aside' | 'write-through' | 'write-behind';
export interface CacheOptions {
    ttl?: number;
    level?: CacheLevel;
    compress?: boolean;
    tags?: string[];
}
export declare class CacheService {
    private redis;
    private local;
    private config;
    private metrics;
    private logger;
    private locks;
    constructor(config?: Partial<CacheConfig>);
    get<T>(key: string, fetcher?: (() => Promise<T>) | undefined, options?: CacheOptions): Promise<T | null>;
    set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
    delete(key: string | string[], level?: CacheLevel): Promise<void>;
    deleteByTags(tags: string[]): Promise<void>;
    flush(level?: CacheLevel): Promise<void>;
    getStats(): {
        local: {
            size: number;
            max: number;
            calculatedSize: number;
        };
        metrics: {
            hits: {
                L1: number;
                L2: number;
            };
            misses: number;
            errors: number;
            hitRate: number;
            avgLatency: number;
            total: number;
        };
        locks: number;
    };
    close(): Promise<void>;
    private fetchAndCache;
    private serialize;
    private deserialize;
    private isBase64;
    private getTTLForKey;
    private addToTags;
}
//# sourceMappingURL=cache-service.d.ts.map