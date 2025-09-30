import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { BadRequestError } from '../utils/errors';
import { validationService } from '../services/validation.service';

export interface WalletRequest extends AuthRequest {
  wallet?: {
    address: string;
    signature?: string;
  };
}

export const walletMiddleware = (req: WalletRequest, _res: Response, next: NextFunction) => {
  const walletAddress = req.headers['x-wallet-address'] as string;
  const walletSignature = req.headers['x-wallet-signature'] as string;

  if (!walletAddress) {
    return next(new BadRequestError('Wallet address required'));
  }

  if (!validationService.validateWalletAddress(walletAddress)) {
    return next(new BadRequestError('Invalid wallet address'));
  }

  // In production, verify the signature
  // For now, just attach wallet info
  req.wallet = {
    address: walletAddress,
    signature: walletSignature,
  };

  next();
};

export const requireWallet = walletMiddleware;
