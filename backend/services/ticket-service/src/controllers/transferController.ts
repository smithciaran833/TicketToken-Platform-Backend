import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { transferService } from '../services/transferService';

export class TransferController {

  async transferTicket(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { ticketId, toUserId, reason } = req.body;
      const fromUserId = req.user!.id;

      const transfer = await transferService.transferTicket(
        ticketId,
        fromUserId,
        toUserId,
        reason
      );

      res.json({
        success: true,
        data: transfer
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransferHistory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { ticketId } = req.params;
      
      const history = await transferService.getTransferHistory(ticketId);
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }

  async validateTransfer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { ticketId, toUserId } = req.body;
      const fromUserId = req.user!.id;

      const validation = await transferService.validateTransferRequest(
        ticketId,
        fromUserId,
        toUserId
      );

      res.json({
        success: validation.valid,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  }
}

export const transferController = new TransferController();
