"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = blockchainRoutes;
const logger_1 = require("../utils/logger");
const validation_1 = require("../middleware/validation");
async function blockchainRoutes(fastify) {
    const queryService = fastify.blockchainQuery;
    const confirmationService = fastify.transactionConfirmation;
    fastify.get('/blockchain/balance/:address', {
        preHandler: [validation_1.validateAddressParam]
    }, async (request, reply) => {
        try {
            const { address } = request.params;
            const balance = await queryService.getBalance(address);
            return {
                address,
                balance,
                sol: balance / 1e9
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get balance', {
                error: error.message,
                address: request.params.address
            });
            return reply.status(500).send({
                error: 'Failed to get balance',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/tokens/:address', {
        preHandler: [validation_1.validateAddressParam]
    }, async (request, reply) => {
        try {
            const { address } = request.params;
            const tokens = await queryService.getTokenAccounts(address);
            return {
                address,
                count: tokens.length,
                tokens
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get tokens', {
                error: error.message,
                address: request.params.address
            });
            return reply.status(500).send({
                error: 'Failed to get tokens',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/nfts/:address', {
        preHandler: [validation_1.validateAddressParam]
    }, async (request, reply) => {
        try {
            const { address } = request.params;
            const nfts = await queryService.getNFTsByOwner(address);
            return {
                address,
                count: nfts.length,
                nfts
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get NFTs', {
                error: error.message,
                address: request.params.address
            });
            return reply.status(500).send({
                error: 'Failed to get NFTs',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/transaction/:signature', {
        preHandler: [validation_1.validateSignatureParam]
    }, async (request, reply) => {
        try {
            const { signature } = request.params;
            const transaction = await queryService.getTransaction(signature);
            if (!transaction) {
                return reply.status(404).send({
                    error: 'Transaction not found'
                });
            }
            return {
                signature,
                transaction
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get transaction', {
                error: error.message,
                signature: request.params.signature
            });
            return reply.status(500).send({
                error: 'Failed to get transaction',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/transactions/:address', {
        preHandler: [validation_1.validateAddressParam]
    }, async (request, reply) => {
        try {
            const { address } = request.params;
            const limitStr = request.query.limit;
            if (limitStr !== undefined) {
                const limit = parseInt(limitStr, 10);
                if (isNaN(limit) || limit < 1 || limit > 100) {
                    return reply.status(400).send({
                        error: 'Bad Request',
                        message: 'Limit must be between 1 and 100'
                    });
                }
            }
            const limit = parseInt(request.query.limit || '10', 10);
            const transactions = await queryService.getRecentTransactions(address, limit);
            return {
                address,
                count: transactions.length,
                transactions
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get transactions', {
                error: error.message,
                address: request.params.address
            });
            return reply.status(500).send({
                error: 'Failed to get transactions',
                message: error.message
            });
        }
    });
    fastify.post('/blockchain/confirm-transaction', {
        preHandler: [validation_1.validateConfirmationRequest]
    }, async (request, reply) => {
        try {
            const { signature, commitment, timeout } = request.body;
            const result = await confirmationService.confirmTransaction(signature, {
                commitment,
                timeout
            });
            return result;
        }
        catch (error) {
            logger_1.logger.error('Failed to confirm transaction', {
                error: error.message,
                signature: request.body.signature
            });
            return reply.status(500).send({
                error: 'Failed to confirm transaction',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/account/:address', {
        preHandler: [validation_1.validateAddressParam]
    }, async (request, reply) => {
        try {
            const { address } = request.params;
            const accountInfo = await queryService.getAccountInfo(address);
            if (!accountInfo) {
                return reply.status(404).send({
                    error: 'Account not found'
                });
            }
            return {
                address,
                lamports: accountInfo.lamports,
                owner: accountInfo.owner.toString(),
                executable: accountInfo.executable,
                rentEpoch: accountInfo.rentEpoch
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get account info', {
                error: error.message,
                address: request.params.address
            });
            return reply.status(500).send({
                error: 'Failed to get account info',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/token-supply/:mint', {
        preHandler: [validation_1.validateMintParam]
    }, async (request, reply) => {
        try {
            const { mint } = request.params;
            const supply = await queryService.getTokenSupply(mint);
            return {
                mint,
                amount: supply.amount,
                decimals: supply.decimals,
                uiAmount: supply.uiAmount
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get token supply', {
                error: error.message,
                mint: request.params.mint
            });
            return reply.status(500).send({
                error: 'Failed to get token supply',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/slot', async (request, reply) => {
        try {
            const slot = await queryService.getCurrentSlot();
            return {
                slot,
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get current slot', {
                error: error.message
            });
            return reply.status(500).send({
                error: 'Failed to get current slot',
                message: error.message
            });
        }
    });
    fastify.get('/blockchain/blockhash', async (request, reply) => {
        try {
            const blockhash = await queryService.getLatestBlockhash();
            return blockhash;
        }
        catch (error) {
            logger_1.logger.error('Failed to get blockhash', {
                error: error.message
            });
            return reply.status(500).send({
                error: 'Failed to get blockhash',
                message: error.message
            });
        }
    });
}
//# sourceMappingURL=blockchain.routes.js.map