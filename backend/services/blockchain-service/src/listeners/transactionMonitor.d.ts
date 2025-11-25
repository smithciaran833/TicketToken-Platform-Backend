import { BaseListener } from './baseListener';
import { Connection } from '@solana/web3.js';
import { Pool } from 'pg';
export declare class TransactionMonitor extends BaseListener {
    private pendingTransactions;
    constructor(connection: Connection, db: Pool);
    monitorTransaction(signature: string, metadata?: any): Promise<void>;
    checkTransaction(signature: string): Promise<void>;
    updateTransactionStatus(signature: string, status: string, confirmations: number, error: any): Promise<void>;
    finalizeTicketMinting(ticketId: string, success: boolean): Promise<void>;
    setupSubscriptions(): Promise<void>;
}
export default TransactionMonitor;
//# sourceMappingURL=transactionMonitor.d.ts.map