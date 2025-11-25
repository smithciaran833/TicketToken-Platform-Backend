export interface RetryConfig {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableErrors?: string[];
}
export declare function retryOperation<T>(operation: () => Promise<T>, operationName: string, config?: RetryConfig): Promise<T>;
//# sourceMappingURL=retry.d.ts.map