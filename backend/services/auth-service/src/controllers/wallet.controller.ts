import { WalletService } from '../services/wallet.service';
import { AuthenticationError } from '../errors';

export class WalletController {
  constructor(private walletService: WalletService) {}

  async requestNonce(request: any, reply: any) {
    try {
      const { publicKey, chain } = request.body;
      
      const result = await this.walletService.generateNonce(publicKey, chain);
      
      return reply.status(200).send(result);
    } catch (error: any) {
      console.error('Nonce generation error:', error);
      return reply.status(500).send({
        error: 'Failed to generate nonce'
      });
    }
  }

  async register(request: any, reply: any) {
    try {
      const { publicKey, signature, nonce, chain, tenant_id } = request.body;
      
      const result = await this.walletService.registerWithWallet(
        publicKey,
        signature,
        nonce,
        chain,
        tenant_id
      );
      
      return reply.status(201).send(result);
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.message
        });
      }
      
      // Check for duplicate wallet
      if (error.message?.includes('duplicate') || error.code === '23505') {
        return reply.status(409).send({
          success: false,
          error: 'Wallet already registered'
        });
      }
      
      console.error('Wallet registration error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Registration failed'
      });
    }
  }

  async login(request: any, reply: any) {
    try {
      const { publicKey, signature, nonce, chain } = request.body;
      
      const result = await this.walletService.loginWithWallet(
        publicKey,
        signature,
        nonce,
        chain
      );
      
      return reply.status(200).send(result);
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.message
        });
      }
      
      console.error('Wallet login error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Login failed'
      });
    }
  }

  async linkWallet(request: any, reply: any) {
    try {
      const userId = request.user.id;
      const { publicKey, signature, nonce, chain } = request.body;
      
      const result = await this.walletService.linkWallet(
        userId,
        publicKey,
        signature,
        nonce,
        chain
      );
      
      return reply.status(200).send(result);
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.message
        });
      }
      
      console.error('Wallet link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to link wallet'
      });
    }
  }

  async unlinkWallet(request: any, reply: any) {
    try {
      const userId = request.user.id;
      const { publicKey } = request.params;
      
      const result = await this.walletService.unlinkWallet(userId, publicKey);
      
      return reply.status(200).send(result);
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.message
        });
      }
      
      console.error('Wallet unlink error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to unlink wallet'
      });
    }
  }
}
