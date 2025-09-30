export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, { value: string; expires: number }> = new Map();

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttl: number): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async checkLimit(key: string, limit: number, window: number): Promise<boolean> {
    const count = parseInt(await this.get(key) || '0');
    if (count >= limit) return false;
    await this.set(key, (count + 1).toString(), window);
    return true;
  }
}
