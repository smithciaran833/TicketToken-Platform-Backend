export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items
}

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export class MemoryCache<K = string, V = any> {
  private cache = new Map<K, CacheEntry<V>>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || 5 * 60 * 1000; // Default 5 minutes
    this.maxSize = options.maxSize || 1000;
  }

  set(key: K, value: V, ttl?: number): void {
    // Enforce max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest entry (LRU eviction)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {  // ← FIXED: Check for undefined
        this.cache.delete(firstKey);
      }
    }

    const expiry = Date.now() + (ttl || this.ttl);
    this.cache.set(key, { value, expiry });
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    // Clean expired entries first
    this.cleanExpired();
    return this.cache.size;
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  // Memoize a function
  memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => K
  ): T {
    return ((...args: Parameters<T>) => {
      const key = keyGenerator ? keyGenerator(...args) : (JSON.stringify(args) as K);
      
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const result = fn(...args);
      this.set(key, result);
      return result;
    }) as T;
  }

  // Memoize an async function
  memoizeAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => K
  ): T {
    return (async (...args: Parameters<T>) => {
      const key = keyGenerator ? keyGenerator(...args) : (JSON.stringify(args) as K);
      
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const result = await fn(...args);
      this.set(key, result);
      return result;
    }) as T;
  }
}
