import { Response, NextFunction } from 'express';
import { WalletRequest } from '../middleware/wallet.middleware';
import { transferService } from '../services/transfer.service';

export class TransferController {
  async initiateTransfer(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const transfer = await transferService.initiateTransfer({
        ...req.body,
        buyerId: req.user!.id,
        buyerWallet: req.wallet!.address,
      });

      res.json({
        success: true,
        data: {
          transferId: transfer.id,
          status: transfer.status,
          expiresIn: 600, // 10 minutes to complete
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmTransfer(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { signature } = req.body;

      const transfer = await transferService.completeTransfer({
        transferId: id,
        blockchainSignature: signature,
      });

      res.json({
        success: true,
        data: transfer,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransfer(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const transfer = await transferService.getTransferById(id);

      res.json({
        success: true,
        data: transfer,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyPurchases(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const transfers = await transferService.getUserTransfers(
        req.user!.id,
        'buyer',
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        data: transfers,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getMySales(req: WalletRequest, res: Response, next: NextFunction) {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const transfers = await transferService.getUserTransfers(
        req.user!.id,
        'seller',
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        data: transfers,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async purchaseListing(_req: WalletRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async directTransfer(_req: WalletRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async getTransferHistory(_req: WalletRequest, res: Response, next: NextFunction) {
    try {
      res.json({ history: [] });
    } catch (error) {
      next(error);
    }
  }

  async cancelTransfer(_req: WalletRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export const transferController = new TransferController();
