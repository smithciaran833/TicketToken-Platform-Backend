"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheStrategies = void 0;
class CacheStrategies {
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    async cacheAside(options) {
        const { key, fetcher, ...cacheOptions } = options;
        return this.cache.get(key, fetcher, cacheOptions);
    }
    async writeThrough(value, options) {
        const { key, updater, ...cacheOptions } = options;
        if (updater) {
            await updater(value);
        }
        await this.cache.set(key, value, cacheOptions);
    }
    async writeBehind(value, options) {
        const { key, updater, ...cacheOptions } = options;
        await this.cache.set(key, value, cacheOptions);
        if (updater) {
            setImmediate(async () => {
                try {
                    await updater(value);
                }
                catch (error) {
                    console.error(`Write-behind failed for key ${key}:`, error);
                }
            });
        }
    }
    async refreshAhead(options) {
        const { key, fetcher, refreshThreshold = 0.3, ttl = 300, ...cacheOptions } = options;
        const value = await this.cache.get(key, undefined, cacheOptions);
        if (value !== null && fetcher) {
            const shouldRefresh = Math.random() < refreshThreshold;
            if (shouldRefresh) {
                setImmediate(async () => {
                    try {
                        const freshValue = await fetcher();
                        await this.cache.set(key, freshValue, { ...cacheOptions, ttl });
                    }
                    catch (error) {
                        console.error(`Refresh-ahead failed for key ${key}:`, error);
                    }
                });
            }
        }
        else if (value === null && fetcher) {
            const freshValue = await fetcher();
            await this.cache.set(key, freshValue, { ...cacheOptions, ttl });
            return freshValue;
        }
        return value;
    }
    async withLock(key, operation, timeout = 5000) {
        const lockKey = `lock:${key}`;
        const lockValue = Math.random().toString(36);
        const acquired = await this.cache['redis'].set(lockKey, lockValue, 'PX', timeout, 'NX');
        if (!acquired) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const value = await this.cache.get(key, undefined);
            if (value !== null) {
                return value;
            }
            return this.withLock(key, operation, timeout);
        }
        try {
            const result = await operation();
            const currentLock = await this.cache['redis'].get(lockKey);
            if (currentLock === lockValue) {
                await this.cache['redis'].del(lockKey);
            }
            return result;
        }
        catch (error) {
            const currentLock = await this.cache['redis'].get(lockKey);
            if (currentLock === lockValue) {
                await this.cache['redis'].del(lockKey);
            }
            throw error;
        }
    }
    async batchGet(keys, fetcher, options = {}) {
        const results = new Map();
        const missingKeys = [];
        const promises = keys.map(async (key) => {
            const value = await this.cache.get(key, undefined, options);
            if (value !== null) {
                results.set(key, value);
            }
            else {
                missingKeys.push(key);
            }
        });
        await Promise.all(promises);
        if (missingKeys.length > 0 && fetcher) {
            const fetchedValues = await fetcher(missingKeys);
            const cachePromises = Array.from(fetchedValues.entries()).map(async ([key, value]) => {
                await this.cache.set(key, value, options);
                results.set(key, value);
            });
            await Promise.all(cachePromises);
        }
        keys.forEach(key => {
            if (!results.has(key)) {
                results.set(key, null);
            }
        });
        return results;
    }
}
exports.CacheStrategies = CacheStrategies;
//# sourceMappingURL=cache-strategies.js.map