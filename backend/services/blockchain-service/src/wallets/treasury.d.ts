import { Connection, Transaction } from '@solana/web3.js';
import { Pool } from 'pg';
export declare class TreasuryWallet {
    private connection;
    private db;
    private keypair;
    private publicKey;
    private isInitialized;
    constructor(connection: Connection, db: Pool);
    initialize(): Promise<void>;
    getBalance(): Promise<number>;
    signTransaction(transaction: Transaction): Promise<Transaction>;
}
export default TreasuryWallet;
//# sourceMappingURL=treasury.d.ts.map