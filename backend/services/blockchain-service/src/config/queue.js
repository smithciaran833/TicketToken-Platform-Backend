const config = require('./index');

module.exports = {
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || 'RedisSecurePass2024!',
        // Bull doesn't support these options, removed:
        // maxRetriesPerRequest: 3,
        // enableReadyCheck: true,
        // retryStrategy: (times) => { ... }
    },
    defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500,     // Keep last 500 failed jobs
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
                duration: 1000 // 10 operations per second
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
