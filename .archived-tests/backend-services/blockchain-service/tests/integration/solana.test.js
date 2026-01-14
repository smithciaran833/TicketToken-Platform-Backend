"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const BlockchainQueryService_1 = __importDefault(require("../../src/services/BlockchainQueryService"));
const TransactionConfirmationService_1 = __importDefault(require("../../src/services/TransactionConfirmationService"));
describe('Solana Integration Tests', () => {
    let connection;
    let queryService;
    let confirmationService;
    let testWallet;
    beforeAll(() => {
        connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
        queryService = new BlockchainQueryService_1.default(connection);
        confirmationService = new TransactionConfirmationService_1.default(connection);
        testWallet = web3_js_1.Keypair.generate();
    });
    describe('BlockchainQueryService', () => {
        it('should get current slot', async () => {
            const slot = await queryService.getCurrentSlot();
            expect(slot).toBeGreaterThan(0);
            expect(typeof slot).toBe('number');
        });
        it('should get latest blockhash', async () => {
            const blockhash = await queryService.getLatestBlockhash();
            expect(blockhash).toBeDefined();
            expect(blockhash.blockhash).toBeDefined();
            expect(blockhash.lastValidBlockHeight).toBeGreaterThan(0);
        });
        it('should get balance for any address', async () => {
            const balance = await queryService.getBalance(testWallet.publicKey.toString());
            expect(balance).toBeGreaterThanOrEqual(0);
            expect(typeof balance).toBe('number');
        });
        it('should get minimum rent exemption', async () => {
            const minBalance = await queryService.getMinimumBalanceForRentExemption(165);
            expect(minBalance).toBeGreaterThan(0);
            expect(typeof minBalance).toBe('number');
        });
        it('should handle non-existent account gracefully', async () => {
            const accountInfo = await queryService.getAccountInfo(testWallet.publicKey.toString());
            expect(accountInfo).toBeNull();
        });
        it('should get token accounts (empty for new wallet)', async () => {
            const tokens = await queryService.getTokenAccounts(testWallet.publicKey.toString());
            expect(Array.isArray(tokens)).toBe(true);
            expect(tokens).toHaveLength(0);
        });
        it('should get NFTs (empty for new wallet)', async () => {
            const nfts = await queryService.getNFTsByOwner(testWallet.publicKey.toString());
            expect(Array.isArray(nfts)).toBe(true);
            expect(nfts).toHaveLength(0);
        });
    });
    describe('TransactionConfirmationService', () => {
        it('should handle non-existent transaction', async () => {
            const fakeSignature = '1'.repeat(88);
            await expect(confirmationService.getTransactionStatus(fakeSignature)).rejects.toThrow();
        });
        it('should get block time for a slot', async () => {
            const currentSlot = await connection.getSlot();
            const recentSlot = currentSlot - 100;
            const blockTime = await queryService.getBlockTime(recentSlot);
            if (blockTime !== null) {
                expect(blockTime).toBeGreaterThan(0);
                expect(typeof blockTime).toBe('number');
            }
        });
    });
    describe('Connection Health', () => {
        it('should connect to Solana devnet', async () => {
            const version = await connection.getVersion();
            expect(version).toBeDefined();
            expect(version['solana-core']).toBeDefined();
        });
        it('should get recent performance samples', async () => {
            const samples = await connection.getRecentPerformanceSamples(1);
            expect(Array.isArray(samples)).toBe(true);
            expect(samples.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=solana.test.js.map