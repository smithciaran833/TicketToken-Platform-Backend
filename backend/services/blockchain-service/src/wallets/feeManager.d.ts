import { Connection, PublicKey } from '@solana/web3.js';
interface FeeBreakdown {
    rentExemption?: number;
    transactionFee: number;
    priorityFee: number;
    total: number;
    totalLamports: number;
}
interface BalanceCheck {
    sufficient: boolean;
    required: number;
    actual: number;
    shortfall?: number;
    surplus?: number;
}
export declare class FeeManager {
    private connection;
    private fees;
    constructor(connection: Connection);
    calculateMintingFee(): FeeBreakdown;
    calculateTransferFee(): FeeBreakdown;
    calculateBurnFee(): FeeBreakdown;
    getOptimalPriorityFee(): Promise<number>;
    ensureSufficientBalance(publicKey: PublicKey, requiredSol: number): Promise<BalanceCheck>;
    formatFeeBreakdown(fees: FeeBreakdown): string;
}
export default FeeManager;
//# sourceMappingURL=feeManager.d.ts.map