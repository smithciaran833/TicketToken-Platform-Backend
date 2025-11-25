"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainQueryService = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("../utils/logger");
class BlockchainQueryService {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    async getBalance(address) {
        try {
            const publicKey = new web3_js_1.PublicKey(address);
            const balance = await this.connection.getBalance(publicKey);
            logger_1.logger.debug('Retrieved SOL balance', {
                address,
                balance,
                sol: balance / 1e9
            });
            return balance;
        }
        catch (error) {
            logger_1.logger.error('Failed to get balance', {
                address,
                error: error.message
            });
            throw error;
        }
    }
    async getTokenAccounts(ownerAddress) {
        try {
            const publicKey = new web3_js_1.PublicKey(ownerAddress);
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(publicKey, { programId: new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
            const accounts = tokenAccounts.value.map(account => {
                const parsedInfo = account.account.data.parsed.info;
                return {
                    mint: parsedInfo.mint,
                    owner: parsedInfo.owner,
                    amount: parsedInfo.tokenAmount.amount,
                    decimals: parsedInfo.tokenAmount.decimals
                };
            });
            logger_1.logger.debug('Retrieved token accounts', {
                owner: ownerAddress,
                count: accounts.length
            });
            return accounts;
        }
        catch (error) {
            logger_1.logger.error('Failed to get token accounts', {
                owner: ownerAddress,
                error: error.message
            });
            throw error;
        }
    }
    async getNFTsByOwner(ownerAddress) {
        try {
            const tokenAccounts = await this.getTokenAccounts(ownerAddress);
            const nftAccounts = tokenAccounts.filter(account => account.amount === '1' && account.decimals === 0);
            const nfts = nftAccounts.map(account => ({
                mint: account.mint,
                owner: account.owner
            }));
            logger_1.logger.debug('Retrieved NFTs', {
                owner: ownerAddress,
                count: nfts.length
            });
            return nfts;
        }
        catch (error) {
            logger_1.logger.error('Failed to get NFTs', {
                owner: ownerAddress,
                error: error.message
            });
            throw error;
        }
    }
    async getTransaction(signature) {
        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });
            if (tx) {
                logger_1.logger.debug('Retrieved transaction', {
                    signature,
                    slot: tx.slot,
                    success: tx.meta?.err === null
                });
            }
            else {
                logger_1.logger.warn('Transaction not found', { signature });
            }
            return tx;
        }
        catch (error) {
            logger_1.logger.error('Failed to get transaction', {
                signature,
                error: error.message
            });
            throw error;
        }
    }
    async getRecentTransactions(address, limit = 10) {
        try {
            const publicKey = new web3_js_1.PublicKey(address);
            const signatures = await this.connection.getSignaturesForAddress(publicKey, {
                limit
            });
            const transactions = await Promise.all(signatures.map(sig => this.getTransaction(sig.signature)));
            const validTransactions = transactions.filter((tx) => tx !== null);
            logger_1.logger.debug('Retrieved recent transactions', {
                address,
                requested: limit,
                found: validTransactions.length
            });
            return validTransactions;
        }
        catch (error) {
            logger_1.logger.error('Failed to get recent transactions', {
                address,
                error: error.message
            });
            throw error;
        }
    }
    async getAccountInfo(address) {
        try {
            const publicKey = new web3_js_1.PublicKey(address);
            const accountInfo = await this.connection.getAccountInfo(publicKey);
            if (accountInfo) {
                logger_1.logger.debug('Retrieved account info', {
                    address,
                    lamports: accountInfo.lamports,
                    owner: accountInfo.owner.toString()
                });
            }
            else {
                logger_1.logger.warn('Account not found', { address });
            }
            return accountInfo;
        }
        catch (error) {
            logger_1.logger.error('Failed to get account info', {
                address,
                error: error.message
            });
            throw error;
        }
    }
    async getTokenSupply(mintAddress) {
        try {
            const publicKey = new web3_js_1.PublicKey(mintAddress);
            const supply = await this.connection.getTokenSupply(publicKey);
            logger_1.logger.debug('Retrieved token supply', {
                mint: mintAddress,
                amount: supply.value.amount,
                decimals: supply.value.decimals
            });
            return supply.value;
        }
        catch (error) {
            logger_1.logger.error('Failed to get token supply', {
                mint: mintAddress,
                error: error.message
            });
            throw error;
        }
    }
    async getCurrentSlot() {
        try {
            const slot = await this.connection.getSlot();
            logger_1.logger.debug('Retrieved current slot', { slot });
            return slot;
        }
        catch (error) {
            logger_1.logger.error('Failed to get current slot', {
                error: error.message
            });
            throw error;
        }
    }
    async getBlockTime(slot) {
        try {
            const blockTime = await this.connection.getBlockTime(slot);
            if (blockTime) {
                logger_1.logger.debug('Retrieved block time', {
                    slot,
                    blockTime,
                    date: new Date(blockTime * 1000).toISOString()
                });
            }
            else {
                logger_1.logger.warn('Block time not available', { slot });
            }
            return blockTime;
        }
        catch (error) {
            logger_1.logger.error('Failed to get block time', {
                slot,
                error: error.message
            });
            throw error;
        }
    }
    async accountExists(address) {
        try {
            const accountInfo = await this.getAccountInfo(address);
            return accountInfo !== null;
        }
        catch (error) {
            logger_1.logger.error('Failed to check account existence', {
                address,
                error: error.message
            });
            return false;
        }
    }
    async getLatestBlockhash() {
        try {
            const blockhash = await this.connection.getLatestBlockhash();
            logger_1.logger.debug('Retrieved latest blockhash', {
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight
            });
            return blockhash;
        }
        catch (error) {
            logger_1.logger.error('Failed to get latest blockhash', {
                error: error.message
            });
            throw error;
        }
    }
    async getMinimumBalanceForRentExemption(dataLength) {
        try {
            const minBalance = await this.connection.getMinimumBalanceForRentExemption(dataLength);
            logger_1.logger.debug('Retrieved minimum rent exemption', {
                dataLength,
                minBalance,
                sol: minBalance / 1e9
            });
            return minBalance;
        }
        catch (error) {
            logger_1.logger.error('Failed to get minimum rent exemption', {
                dataLength,
                error: error.message
            });
            throw error;
        }
    }
    async getMultipleAccounts(addresses) {
        try {
            const publicKeys = addresses.map(addr => new web3_js_1.PublicKey(addr));
            const accounts = await this.connection.getMultipleAccountsInfo(publicKeys);
            logger_1.logger.debug('Retrieved multiple accounts', {
                requested: addresses.length,
                found: accounts.filter(a => a !== null).length
            });
            return accounts;
        }
        catch (error) {
            logger_1.logger.error('Failed to get multiple accounts', {
                count: addresses.length,
                error: error.message
            });
            throw error;
        }
    }
}
exports.BlockchainQueryService = BlockchainQueryService;
exports.default = BlockchainQueryService;
//# sourceMappingURL=BlockchainQueryService.js.map