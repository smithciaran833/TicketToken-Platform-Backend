import { Request, Response } from 'express';
import { complianceService } from '../services/compliance.service';
import { logger } from '../config/logger';
import { validationResult } from 'express-validator';

export class ConsentController {
  async grant(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { customerId, channel, type, source, venueId } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      await complianceService.recordConsent(
        customerId,
        channel,
        type,
        source,
        venueId,
        ipAddress,
        userAgent
      );

      res.status(201).json({
        success: true,
        message: 'Consent recorded successfully',
      });
    } catch (error: any) {
      logger.error('Failed to record consent', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async revoke(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { customerId, channel, type, venueId } = req.body;

      await complianceService.revokeConsent(
        customerId,
        channel,
        type,
        venueId
      );

      res.status(200).json({
        success: true,
        message: 'Consent revoked successfully',
      });
    } catch (error: any) {
      logger.error('Failed to revoke consent', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async check(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;
      const { channel, type, venueId } = req.query;

      const consentModel = require('../models/consent.model').consentModel;
      const hasConsent = await consentModel.hasConsent(
        customerId,
        channel as any,
        type as any,
        venueId as string
      );

      res.status(200).json({
        success: true,
        data: {
          hasConsent,
          customerId,
          channel,
          type,
          venueId,
        },
      });
    } catch (error: any) {
      logger.error('Failed to check consent', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export const consentController = new ConsentController();
