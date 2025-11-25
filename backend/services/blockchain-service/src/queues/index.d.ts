import MintQueue from './mintQueue';
declare class QueueManager {
    private queues;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    getMintQueue(): MintQueue;
    getStats(): Promise<any>;
    shutdown(): Promise<void>;
}
declare const _default: QueueManager;
export default _default;
//# sourceMappingURL=index.d.ts.map