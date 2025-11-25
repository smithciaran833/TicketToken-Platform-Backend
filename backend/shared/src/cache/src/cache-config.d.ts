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
        max: number;
        ttl: number;
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
        threshold: number;
    };
}
export declare const defaultConfig: CacheConfig;
//# sourceMappingURL=cache-config.d.ts.map