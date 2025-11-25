"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.defaultConfig = {
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: 0,
        keyPrefix: 'cache:',
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => {
            if (times > 3)
                return undefined;
            return Math.min(times * 100, 3000);
        }
    },
    local: {
        max: 1000,
        ttl: 60 * 1000,
        updateAgeOnGet: true,
        updateAgeOnHas: false
    },
    ttls: {
        session: 5 * 60,
        user: 5 * 60,
        event: 10 * 60,
        venue: 30 * 60,
        ticket: 30,
        template: 60 * 60,
        search: 5 * 60
    },
    compression: {
        enabled: true,
        threshold: 1024
    }
};
//# sourceMappingURL=cache-config.js.map