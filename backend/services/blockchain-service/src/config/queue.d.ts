interface RedisConfig {
    host: string;
    port: number;
    password: string;
}
interface BackoffConfig {
    type: string;
    delay: number;
}
interface DefaultJobOptions {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: BackoffConfig;
}
interface RateLimit {
    max: number;
    duration: number;
}
interface QueueConfig {
    concurrency: number;
    rateLimit: RateLimit;
}
interface QueuesConfig {
    'nft-minting': QueueConfig;
    'nft-transfer': QueueConfig;
    'nft-burn': QueueConfig;
}
interface QueueConfiguration {
    redis: RedisConfig;
    defaultJobOptions: DefaultJobOptions;
    queues: QueuesConfig;
}
declare const queueConfig: QueueConfiguration;
export default queueConfig;
//# sourceMappingURL=queue.d.ts.map