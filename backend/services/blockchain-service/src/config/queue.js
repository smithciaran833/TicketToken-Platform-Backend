"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const queueConfig = {
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || 'RedisSecurePass2024!',
    },
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        }
    },
    queues: {
        'nft-minting': {
            concurrency: 5,
            rateLimit: {
                max: 10,
                duration: 1000
            }
        },
        'nft-transfer': {
            concurrency: 10,
            rateLimit: {
                max: 20,
                duration: 1000
            }
        },
        'nft-burn': {
            concurrency: 3,
            rateLimit: {
                max: 5,
                duration: 1000
            }
        }
    }
};
exports.default = queueConfig;
//# sourceMappingURL=queue.js.map