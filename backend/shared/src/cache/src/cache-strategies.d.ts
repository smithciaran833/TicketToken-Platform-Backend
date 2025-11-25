import { CacheService, CacheOptions } from './cache-service';
export type CachePattern = 'cache-aside' | 'write-through' | 'write-behind' | 'refresh-ahead';
export interface StrategyOptions<T> extends CacheOptions {
    ttl?: number;
    key: string;
    fetcher?: () => Promise<T>;
    updater?: (value: T) => Promise<void>;
    refreshThreshold?: number;
}
export declare class CacheStrategies {
    private cache;
    constructor(cache: CacheService);
    cacheAside<T>(options: StrategyOptions<T>): Promise<T | null>;
    writeThrough<T>(value: T, options: StrategyOptions<T>): Promise<void>;
    writeBehind<T>(value: T, options: StrategyOptions<T>): Promise<void>;
    refreshAhead<T>(options: StrategyOptions<T>): Promise<T | null>;
    withLock<T>(key: string, operation: () => Promise<T>, timeout?: number): Promise<T>;
    batchGet<T>(keys: string[], fetcher?: (missingKeys: string[]) => Promise<Map<string, T>>, options?: CacheOptions): Promise<Map<string, T | null>>;
}
//# sourceMappingURL=cache-strategies.d.ts.map