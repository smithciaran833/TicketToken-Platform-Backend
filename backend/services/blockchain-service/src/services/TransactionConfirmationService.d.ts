import { Connection, TransactionSignature, SignatureStatus, Commitment } from '@solana/web3.js';
interface ConfirmationConfig {
    commitment?: Commitment;
    timeout?: number;
    pollInterval?: number;
}
interface ConfirmationResult {
    confirmed: boolean;
    signature: string;
    slot?: number;
    confirmations?: number;
    err?: any;
}
export declare class TransactionConfirmationService {
    private connection;
    private defaultTimeout;
    private defaultPollInterval;
    private defaultCommitment;
    constructor(connection: Connection);
    confirmTransaction(signature: TransactionSignature, config?: ConfirmationConfig): Promise<ConfirmationResult>;
    getTransactionStatus(signature: TransactionSignature): Promise<SignatureStatus>;
    confirmTransactions(signatures: TransactionSignature[], config?: ConfirmationConfig): Promise<ConfirmationResult[]>;
    pollForConfirmation(signature: TransactionSignature, commitment?: Commitment, timeout?: number): Promise<ConfirmationResult>;
    private checkCommitmentLevel;
    getTransaction(signature: TransactionSignature, maxRetries?: number): Promise<any>;
}
export default TransactionConfirmationService;
//# sourceMappingURL=TransactionConfirmationService.d.ts.map