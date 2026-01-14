"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const treasury_1 = require("../../src/wallets/treasury");
describe('Devnet Validation Tests', () => {
    let connection;
    let treasuryWallet;
    beforeAll(() => {
        connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
        const keypair = web3_js_1.Keypair.generate();
        treasuryWallet = new treasury_1.TreasuryWallet(connection, keypair);
    });
    describe.skip('Treasury Wallet Operations', () => {
        it('should have sufficient balance', async () => {
            const balance = await treasuryWallet.getBalance();
            expect(balance).toBeGreaterThan(0.1);
        });
        it('should check treasury balance status', async () => {
            const balance = await treasuryWallet.getBalance();
            expect(typeof balance).toBe('number');
            expect(balance).toBeGreaterThanOrEqual(0);
        });
    });
    describe('Devnet Connection Health', () => {
        it('should connect to devnet successfully', async () => {
            const version = await connection.getVersion();
            expect(version).toBeDefined();
            expect(version['solana-core']).toBeDefined();
        });
        it('should get current slot from devnet', async () => {
            const slot = await connection.getSlot();
            expect(slot).toBeGreaterThan(0);
            expect(typeof slot).toBe('number');
        });
        it('should get recent blockhash from devnet', async () => {
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            expect(blockhash).toBeDefined();
            expect(blockhash.length).toBeGreaterThan(0);
            expect(lastValidBlockHeight).toBeGreaterThan(0);
        });
        it('should get epoch info from devnet', async () => {
            const epochInfo = await connection.getEpochInfo();
            expect(epochInfo.epoch).toBeGreaterThanOrEqual(0);
            expect(epochInfo.slotIndex).toBeGreaterThanOrEqual(0);
            expect(epochInfo.slotsInEpoch).toBeGreaterThan(0);
        });
        it('should get minimum balance for rent exemption', async () => {
            const minBalance = await connection.getMinimumBalanceForRentExemption(165);
            expect(minBalance).toBeGreaterThan(0);
        });
    });
    describe('Account Queries', () => {
        it('should query account balance', async () => {
            const testAddress = web3_js_1.Keypair.generate().publicKey;
            const balance = await connection.getBalance(testAddress);
            expect(balance).toBe(0);
        });
        it('should query account info', async () => {
            const testAddress = web3_js_1.Keypair.generate().publicKey;
            const accountInfo = await connection.getAccountInfo(testAddress);
            expect(accountInfo).toBeNull();
        });
        it('should get token accounts by owner (empty for new address)', async () => {
            const testAddress = web3_js_1.Keypair.generate().publicKey;
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(testAddress, { programId: new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
            expect(tokenAccounts.value).toHaveLength(0);
        });
    });
    describe('Performance Metrics', () => {
        it('should measure RPC response time', async () => {
            const startTime = Date.now();
            await connection.getSlot();
            const endTime = Date.now();
            const latency = endTime - startTime;
            expect(latency).toBeLessThan(3000);
        });
        it('should get performance samples', async () => {
            const samples = await connection.getRecentPerformanceSamples(5);
            expect(Array.isArray(samples)).toBe(true);
            expect(samples.length).toBeGreaterThan(0);
            expect(samples[0].numTransactions).toBeGreaterThan(0);
        });
    });
    describe.skip('Manual Validation (requires funded wallet)', () => {
        it('should validate treasury wallet has funds', async () => {
            const balance = await treasuryWallet.getBalance();
            console.log(`Treasury Balance: ${balance} SOL`);
            expect(balance).toBeGreaterThan(0);
        });
        it('should request airdrop on devnet', async () => {
            const testWallet = web3_js_1.Keypair.generate();
            const signature = await connection.requestAirdrop(testWallet.publicKey, web3_js_1.LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature);
            const balance = await connection.getBalance(testWallet.publicKey);
            expect(balance).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=devnet-validation.test.js.map