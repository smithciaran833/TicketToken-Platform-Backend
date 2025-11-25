import { BaseQueue } from './baseQueue';
import { JobOptions } from 'bull';
interface MintResult {
    success: boolean;
    tokenId: string;
    transactionId: string;
    signature: string;
    blockHeight: number;
    timestamp: string;
    alreadyMinted?: boolean;
}
export declare class MintQueue extends BaseQueue {
    private db;
    constructor();
    setupProcessor(): void;
    checkExistingMint(ticketId: string): Promise<MintResult | null>;
    updateTicketStatus(ticketId: string, status: string): Promise<void>;
    storeJobRecord(jobId: string, ticketId: string, userId: string, status: string): Promise<void>;
    updateJobRecord(jobId: string, status: string, result?: MintResult | null, error?: string | null): Promise<void>;
    simulateMint(ticketId: string, metadata: any): Promise<MintResult>;
    storeTransaction(ticketId: string, mintResult: MintResult): Promise<void>;
    updateTicketAsMinted(ticketId: string, mintResult: MintResult): Promise<void>;
    addMintJob(ticketId: string, userId: string, eventId: string, metadata: any, options?: JobOptions): Promise<any>;
}
export default MintQueue;
//# sourceMappingURL=mintQueue.d.ts.map