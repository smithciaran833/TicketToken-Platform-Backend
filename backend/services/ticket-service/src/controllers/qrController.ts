import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { qrService } from '../services/qrService';
import { ticketService } from '../services/ticketService';
import { ForbiddenError } from '../utils/errors';

export class QRController {

  async generateQR(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { ticketId } = req.params;
      
      // Verify ticket ownership
      const ticket = await ticketService.getTicket(ticketId);
      if (ticket.owner_user_id !== req.user!.id && req.user!.role !== 'admin') {
        throw new ForbiddenError('You do not own this ticket');
      }

      const { qrCode, qrImage } = await qrService.generateRotatingQR(ticketId);
      
      res.json({
        success: true,
        data: {
          qrCode,
          qrImage,
          expiresIn: 30 // seconds
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async validateQR(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { qrCode, eventId, entrance, deviceId } = req.body;
      
      const validation = await qrService.validateQR(qrCode, {
        eventId,
        entrance,
        deviceId,
        validatorId: req.user?.id
      });

      res.json({
        success: validation.isValid,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  }
}

export const qrController = new QRController();
