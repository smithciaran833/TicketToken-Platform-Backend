import { FastifyReply } from 'fastify';
import { AuthRequest } from './auth.middleware';
import { BadRequestError } from '../utils/errors';
import { validationService } from '../services/validation.service';

export interface WalletRequest extends AuthRequest {
  wallet?: {
    address: string;
    signature?: string;
  };
}

export const walletMiddleware = async (request: WalletRequest, reply: FastifyReply) => {
  const walletAddress = request.headers['x-wallet-address'] as string;
  const walletSignature = request.headers['x-wallet-signature'] as string;

  if (!walletAddress) {
    return reply.status(400).send({ error: 'Wallet address required' });
  }

  if (!validationService.validateWalletAddress(walletAddress)) {
    return reply.status(400).send({ error: 'Invalid wallet address' });
  }

  // In production, verify the signature
  // For now, just attach wallet info
  request.wallet = {
    address: walletAddress,
    signature: walletSignature,
  };
};

export const requireWallet = walletMiddleware;
