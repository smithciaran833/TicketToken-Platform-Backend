import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { bankService } from '../services/bank.service';

export class BankController {
  static async verifyBankAccount(req: Request, res: Response) {
    try {
      const { venueId, accountNumber, routingNumber } = req.body;
      
      const verification = await bankService.verifyBankAccount(
        venueId,
        accountNumber,
        routingNumber
      );
      
      res.json({
        success: true,
        message: verification.verified ? 'Bank account verified' : 'Verification failed',
        data: {
          venueId,
          ...verification
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async createPayoutMethod(req: Request, res: Response) {
    try {
      const { venueId, accountToken } = req.body;
      
      const payoutId = await bankService.createPayoutMethod(venueId, accountToken);
      
      res.json({
        success: true,
        message: 'Payout method created',
        data: {
          venueId,
          payoutId
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
