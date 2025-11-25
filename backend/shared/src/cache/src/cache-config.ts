export interface CacheConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    enableReadyCheck?: boolean;
    retryStrategy?: (times: number) => number | undefined;
  };
  local: {
    max: number; // max items in LRU cache
    ttl: number; // default TTL in ms
    updateAgeOnGet?: boolean;
    updateAgeOnHas?: boolean;
  };
  ttls: {
    session: number;
    user: number;
    event: number;
    venue: number;
    ticket: number;
    template: number;
    search: number;
  };
  compression: {
    enabled: boolean;
    threshold: number; // compress if larger than this (bytes)
  };
}

export const defaultConfig: CacheConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: 0,
    keyPrefix: 'cache:',
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
      if (times > 3) return undefined;
      return Math.min(times * 100, 3000);
    },
  },
  local: {
    max: 1000,
    ttl: 60 * 1000, // 1 minute default
    updateAgeOnGet: true,
    updateAgeOnHas: false,
  },
  ttls: {
    session: 5 * 60, // 5 minutes
    user: 5 * 60, // 5 minutes
    event: 10 * 60, // 10 minutes
    venue: 30 * 60, // 30 minutes
    ticket: 30, // 30 seconds
    template: 60 * 60, // 1 hour
    search: 5 * 60, // 5 minutes
  },
  compression: {
    enabled: true,
    threshold: 1024, // 1KB
  },
};
