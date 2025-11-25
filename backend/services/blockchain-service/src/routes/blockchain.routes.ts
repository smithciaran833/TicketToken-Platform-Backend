import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import {
  validateAddressParam,
  validateSignatureParam,
  validateMintParam,
  validateQueryParams,
  validateConfirmationRequest
} from '../middleware/validation';

interface BlockchainQueryParams {
  address?: string;
  signature?: string;
  mint?: string;
  limit?: string;
}

export default async function blockchainRoutes(fastify: FastifyInstance) {
  const queryService = (fastify as any).blockchainQuery;
  const confirmationService = (fastify as any).transactionConfirmation;

  /**
   * GET /blockchain/balance/:address
   * Get SOL balance for an address
   */
  fastify.get('/blockchain/balance/:address', {
    preHandler: [validateAddressParam]
  }, async (
    request: FastifyRequest<{ Params: { address: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { address } = request.params;
      const balance = await queryService.getBalance(address);

      return {
        address,
        balance,
        sol: balance / 1e9
      };
    } catch (error: any) {
      logger.error('Failed to get balance', {
        error: error.message,
        address: request.params.address
      });
      return reply.status(500).send({
        error: 'Failed to get balance',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/tokens/:address
   * Get all token accounts for an address
   */
  fastify.get('/blockchain/tokens/:address', {
    preHandler: [validateAddressParam]
  }, async (
    request: FastifyRequest<{ Params: { address: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { address } = request.params;
      const tokens = await queryService.getTokenAccounts(address);

      return {
        address,
        count: tokens.length,
        tokens
      };
    } catch (error: any) {
      logger.error('Failed to get tokens', {
        error: error.message,
        address: request.params.address
      });
      return reply.status(500).send({
        error: 'Failed to get tokens',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/nfts/:address
   * Get NFTs owned by an address
   */
  fastify.get('/blockchain/nfts/:address', {
    preHandler: [validateAddressParam]
  }, async (
    request: FastifyRequest<{ Params: { address: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { address } = request.params;
      const nfts = await queryService.getNFTsByOwner(address);

      return {
        address,
        count: nfts.length,
        nfts
      };
    } catch (error: any) {
      logger.error('Failed to get NFTs', {
        error: error.message,
        address: request.params.address
      });
      return reply.status(500).send({
        error: 'Failed to get NFTs',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/transaction/:signature
   * Get transaction details
   */
  fastify.get('/blockchain/transaction/:signature', {
    preHandler: [validateSignatureParam]
  }, async (
    request: FastifyRequest<{ Params: { signature: string } }>,
    reply: FastifyReply
  ) => {
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
    } catch (error: any) {
      logger.error('Failed to get transaction', {
        error: error.message,
        signature: request.params.signature
      });
      return reply.status(500).send({
        error: 'Failed to get transaction',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/transactions/:address
   * Get recent transactions for an address
   */
  fastify.get('/blockchain/transactions/:address', {
    preHandler: [validateAddressParam]
  }, async (
    request: FastifyRequest<{ 
      Params: { address: string };
      Querystring: { limit?: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { address } = request.params;
      const limitStr = request.query.limit;
      
      // Validate limit parameter
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
    } catch (error: any) {
      logger.error('Failed to get transactions', {
        error: error.message,
        address: request.params.address
      });
      return reply.status(500).send({
        error: 'Failed to get transactions',
        message: error.message
      });
    }
  });

  /**
   * POST /blockchain/confirm-transaction
   * Confirm a transaction
   */
  fastify.post('/blockchain/confirm-transaction', {
    preHandler: [validateConfirmationRequest]
  }, async (
    request: FastifyRequest<{
      Body: {
        signature: string;
        commitment?: 'processed' | 'confirmed' | 'finalized';
        timeout?: number;
      };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { signature, commitment, timeout } = request.body;

      const result = await confirmationService.confirmTransaction(signature, {
        commitment,
        timeout
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to confirm transaction', {
        error: error.message,
        signature: request.body.signature
      });
      return reply.status(500).send({
        error: 'Failed to confirm transaction',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/account/:address
   * Get account info
   */
  fastify.get('/blockchain/account/:address', {
    preHandler: [validateAddressParam]
  }, async (
    request: FastifyRequest<{ Params: { address: string } }>,
    reply: FastifyReply
  ) => {
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
    } catch (error: any) {
      logger.error('Failed to get account info', {
        error: error.message,
        address: request.params.address
      });
      return reply.status(500).send({
        error: 'Failed to get account info',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/token-supply/:mint
   * Get token supply
   */
  fastify.get('/blockchain/token-supply/:mint', {
    preHandler: [validateMintParam]
  }, async (
    request: FastifyRequest<{ Params: { mint: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { mint } = request.params;
      const supply = await queryService.getTokenSupply(mint);

      return {
        mint,
        amount: supply.amount,
        decimals: supply.decimals,
        uiAmount: supply.uiAmount
      };
    } catch (error: any) {
      logger.error('Failed to get token supply', {
        error: error.message,
        mint: request.params.mint
      });
      return reply.status(500).send({
        error: 'Failed to get token supply',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/slot
   * Get current slot
   */
  fastify.get('/blockchain/slot', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const slot = await queryService.getCurrentSlot();

      return {
        slot,
        timestamp: Date.now()
      };
    } catch (error: any) {
      logger.error('Failed to get current slot', {
        error: error.message
      });
      return reply.status(500).send({
        error: 'Failed to get current slot',
        message: error.message
      });
    }
  });

  /**
   * GET /blockchain/blockhash
   * Get latest blockhash
   */
  fastify.get('/blockchain/blockhash', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const blockhash = await queryService.getLatestBlockhash();

      return blockhash;
    } catch (error: any) {
      logger.error('Failed to get blockhash', {
        error: error.message
      });
      return reply.status(500).send({
        error: 'Failed to get blockhash',
        message: error.message
      });
    }
  });
}
