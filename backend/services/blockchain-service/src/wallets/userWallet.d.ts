import { Pool } from 'pg';
interface ConnectionResult {
    success: boolean;
    wallet?: any;
    message: string;
    error?: string;
}
export declare class UserWalletManager {
    private db;
    constructor(db: Pool);
    connectWallet(userId: string, walletAddress: string, signatureBase64: string, message?: string): Promise<ConnectionResult>;
    verifySignature(publicKeyString: string, signatureBase64: string, message: string): Promise<boolean>;
    getUserWallets(userId: string): Promise<any[]>;
    getPrimaryWallet(userId: string): Promise<any | null>;
    verifyOwnership(userId: string, walletAddress: string): Promise<boolean>;
    disconnectWallet(userId: string, walletAddress: string): Promise<{
        success: boolean;
        message: string;
    }>;
    updateLastUsed(userId: string, walletAddress: string): Promise<void>;
}
export default UserWalletManager;
//# sourceMappingURL=userWallet.d.ts.map