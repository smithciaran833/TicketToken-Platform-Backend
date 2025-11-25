import { Connection, Commitment } from '@solana/web3.js';
interface RPCFailoverConfig {
    endpoints: string[];
    healthCheckInterval?: number;
    maxFailures?: number;
    timeout?: number;
    commitment?: Commitment;
}
export declare class RPCFailoverService {
    private endpoints;
    private currentEndpointIndex;
    private healthCheckInterval;
    private maxFailures;
    private timeout;
    private commitment;
    private healthCheckTimer?;
    private connectionConfig;
    constructor(config: RPCFailoverConfig);
    getConnection(): Connection;
    private getCurrentEndpoint;
    executeWithFailover<T>(operation: (connection: Connection) => Promise<T>, retries?: number): Promise<T>;
    private rotateToNextEndpoint;
    private startHealthChecks;
    private performHealthChecks;
    getHealthStatus(): Array<{
        url: string;
        healthy: boolean;
        latency?: number;
        failureCount: number;
        lastCheck: number;
    }>;
    markEndpointHealthy(url: string): void;
    markEndpointUnhealthy(url: string): void;
    stop(): void;
}
export default RPCFailoverService;
//# sourceMappingURL=RPCFailoverService.d.ts.map