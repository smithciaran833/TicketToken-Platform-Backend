import { Connection, ParsedTransactionWithMeta, TokenAmount } from '@solana/web3.js';
interface TokenAccountInfo {
    mint: string;
    owner: string;
    amount: string;
    decimals: number;
}
interface NFTInfo {
    mint: string;
    owner: string;
    name?: string;
    symbol?: string;
    uri?: string;
}
export declare class BlockchainQueryService {
    private connection;
    constructor(connection: Connection);
    getBalance(address: string): Promise<number>;
    getTokenAccounts(ownerAddress: string): Promise<TokenAccountInfo[]>;
    getNFTsByOwner(ownerAddress: string): Promise<NFTInfo[]>;
    getTransaction(signature: string): Promise<ParsedTransactionWithMeta | null>;
    getRecentTransactions(address: string, limit?: number): Promise<ParsedTransactionWithMeta[]>;
    getAccountInfo(address: string): Promise<import("@solana/web3.js").AccountInfo<Buffer<ArrayBufferLike>> | null>;
    getTokenSupply(mintAddress: string): Promise<TokenAmount>;
    getCurrentSlot(): Promise<number>;
    getBlockTime(slot: number): Promise<number | null>;
    accountExists(address: string): Promise<boolean>;
    getLatestBlockhash(): Promise<Readonly<{
        blockhash: import("@solana/web3.js").Blockhash;
        lastValidBlockHeight: number;
    }>>;
    getMinimumBalanceForRentExemption(dataLength: number): Promise<number>;
    getMultipleAccounts(addresses: string[]): Promise<(import("@solana/web3.js").AccountInfo<Buffer<ArrayBufferLike>> | null)[]>;
}
export default BlockchainQueryService;
//# sourceMappingURL=BlockchainQueryService.d.ts.map