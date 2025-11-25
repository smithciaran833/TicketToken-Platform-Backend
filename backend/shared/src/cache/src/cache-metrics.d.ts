export declare class CacheMetrics {
    private hits;
    private misses;
    private errors;
    private latencies;
    private maxLatencies;
    recordHit(level: 'L1' | 'L2'): void;
    recordMiss(): void;
    recordError(): void;
    recordLatency(ms: number): void;
    getStats(): {
        hits: {
            L1: number;
            L2: number;
        };
        misses: number;
        errors: number;
        hitRate: number;
        avgLatency: number;
        total: number;
    };
    reset(): void;
}
//# sourceMappingURL=cache-metrics.d.ts.map