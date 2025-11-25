declare class BlockchainMetrics {
    recordMintSuccess(durationMs: number): void;
    recordMintFailure(reason: string): void;
    recordMetadataUpload(status: 'success' | 'failure', durationMs?: number): void;
    recordCollectionCreation(): void;
    recordCollectionVerification(status: 'success' | 'failure'): void;
    recordRPCCall(method: string): void;
    recordRPCError(method: string, errorType: string): void;
    recordQueueJob(queue: string, status: 'completed' | 'failed', durationMs?: number): void;
}
export declare const blockchainMetrics: BlockchainMetrics;
export {};
//# sourceMappingURL=blockchain-metrics.d.ts.map