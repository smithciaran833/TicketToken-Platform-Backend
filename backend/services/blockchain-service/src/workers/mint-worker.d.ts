import { Keypair } from '@solana/web3.js';
interface MintJob {
    id?: string;
    orderId: string;
    ticketId?: string;
    userId?: string;
    eventId?: string;
    venueId?: string;
    metadata?: any;
}
export declare class MintWorker {
    private pool;
    private solanaConnection;
    private mintWallet;
    private rabbitConnection;
    private channel;
    private metaplexService;
    private confirmationService;
    constructor();
    initializeWallet(): Keypair;
    start(): Promise<void>;
    connectRabbitMQ(): Promise<void>;
    consumeQueue(): Promise<void>;
    startPolling(): Promise<void>;
    private getVenueWallet;
    private getPlatformWallet;
    processMintJob(job: MintJob): Promise<void>;
    shutdown(): Promise<void>;
}
export default MintWorker;
//# sourceMappingURL=mint-worker.d.ts.map