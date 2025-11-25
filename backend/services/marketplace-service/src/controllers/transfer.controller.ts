import { FastifyReply } from 'fastify';
import { WalletRequest } from '../middleware/wallet.middleware';
import { transferService } from '../services/transfer.service';

export class TransferController {
  async initiateTransfer(request: WalletRequest, reply: FastifyReply) {
    try {
      const body = request.body as any;
      const transfer = await transferService.initiateTransfer({
        ...body,
        buyerId: request.user!.id,
        buyerWallet: request.wallet!.address,
      });

      reply.send({
        success: true,
        data: {
          transferId: transfer.id,
          status: transfer.status,
          expiresIn: 600, // 10 minutes to complete
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async confirmTransfer(request: WalletRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { signature } = request.body as { signature: string };

      const transfer = await transferService.completeTransfer({
        transferId: id,
        blockchainSignature: signature,
      });

      reply.send({
        success: true,
        data: transfer,
      });
    } catch (error) {
      throw error;
    }
  }

  async getTransfer(request: WalletRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const transfer = await transferService.getTransferById(id);

      reply.send({
        success: true,
        data: transfer,
      });
    } catch (error) {
      throw error;
    }
  }

  async getMyPurchases(request: WalletRequest, reply: FastifyReply) {
    try {
      const { limit = 20, offset = 0 } = request.query as any;

      const transfers = await transferService.getUserTransfers(
        request.user!.id,
        'buyer',
        Number(limit),
        Number(offset)
      );

      reply.send({
        success: true,
        data: transfers,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async getMySales(request: WalletRequest, reply: FastifyReply) {
    try {
      const { limit = 20, offset = 0 } = request.query as any;

      const transfers = await transferService.getUserTransfers(
        request.user!.id,
        'seller',
        Number(limit),
        Number(offset)
      );

      reply.send({
        success: true,
        data: transfers,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async purchaseListing(_request: WalletRequest, reply: FastifyReply) {
    try {
      reply.send({ success: true });
    } catch (error) {
      throw error;
    }
  }

  async directTransfer(_request: WalletRequest, reply: FastifyReply) {
    try {
      reply.send({ success: true });
    } catch (error) {
      throw error;
    }
  }

  async getTransferHistory(_request: WalletRequest, reply: FastifyReply) {
    try {
      reply.send({ history: [] });
    } catch (error) {
      throw error;
    }
  }

  async cancelTransfer(_request: WalletRequest, reply: FastifyReply) {
    try {
      reply.send({ success: true });
    } catch (error) {
      throw error;
    }
  }
}

export const transferController = new TransferController();
