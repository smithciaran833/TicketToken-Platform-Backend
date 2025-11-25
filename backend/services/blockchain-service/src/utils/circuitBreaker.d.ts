export declare enum CircuitState {
    CLOSED = 0,
    OPEN = 1,
    HALF_OPEN = 2
}
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
    resetTimeout?: number;
    monitoringPeriod?: number;
}
export declare class CircuitBreakerError extends Error {
    state: CircuitState;
    constructor(message: string, state: CircuitState);
}
export declare class CircuitBreaker {
    private name;
    private options;
    private state;
    private failureCount;
    private successCount;
    private lastFailureTime;
    private nextAttemptTime;
    constructor(name: string, options?: CircuitBreakerOptions);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private executeWithTimeout;
    private onSuccess;
    private onFailure;
    private openCircuit;
    getState(): CircuitState;
    getStats(): {
        state: string;
        failureCount: number;
        successCount: number;
        lastFailureTime: number | null;
        nextAttemptTime: number | null;
    };
    reset(): void;
    private updateMetrics;
    private startMonitoring;
}
export declare class CircuitBreakerManager {
    private breakers;
    getBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker;
    execute<T>(name: string, operation: () => Promise<T>, options?: CircuitBreakerOptions): Promise<T>;
    getAllStats(): Record<string, any>;
    reset(name: string): void;
    resetAll(): void;
}
export declare const circuitBreakerManager: CircuitBreakerManager;
export declare const CIRCUIT_BREAKER_CONFIGS: {
    rpcCall: {
        failureThreshold: number;
        successThreshold: number;
        timeout: number;
        resetTimeout: number;
        monitoringPeriod: number;
    };
    transactionSubmission: {
        failureThreshold: number;
        successThreshold: number;
        timeout: number;
        resetTimeout: number;
        monitoringPeriod: number;
    };
    mintOperation: {
        failureThreshold: number;
        successThreshold: number;
        timeout: number;
        resetTimeout: number;
        monitoringPeriod: number;
    };
    externalService: {
        failureThreshold: number;
        successThreshold: number;
        timeout: number;
        resetTimeout: number;
        monitoringPeriod: number;
    };
};
declare const _default: {
    CircuitBreaker: typeof CircuitBreaker;
    CircuitBreakerManager: typeof CircuitBreakerManager;
    circuitBreakerManager: CircuitBreakerManager;
    CircuitState: typeof CircuitState;
    CIRCUIT_BREAKER_CONFIGS: {
        rpcCall: {
            failureThreshold: number;
            successThreshold: number;
            timeout: number;
            resetTimeout: number;
            monitoringPeriod: number;
        };
        transactionSubmission: {
            failureThreshold: number;
            successThreshold: number;
            timeout: number;
            resetTimeout: number;
            monitoringPeriod: number;
        };
        mintOperation: {
            failureThreshold: number;
            successThreshold: number;
            timeout: number;
            resetTimeout: number;
            monitoringPeriod: number;
        };
        externalService: {
            failureThreshold: number;
            successThreshold: number;
            timeout: number;
            resetTimeout: number;
            monitoringPeriod: number;
        };
    };
};
export default _default;
//# sourceMappingURL=circuitBreaker.d.ts.map