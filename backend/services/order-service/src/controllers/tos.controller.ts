import { Request, Response } from 'express';
import { TOSService } from '../services/tos.service';

interface AuthRequest extends Request {
  tenantId: string;
  userId: string;
}

export class TOSController {
  private tosService: TOSService;

  constructor() {
    this.tosService = new TOSService();
  }

  async createVersion(req: AuthRequest, res: Response): Promise<void> {
    try {
      const version = await this.tosService.createVersion(req.tenantId, req.body);
      res.status(201).json(version);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create TOS version' });
    }
  }

  async getActiveVersion(req: AuthRequest, res: Response): Promise<void> {
    try {
      const version = await this.tosService.getActiveVersion(req.tenantId);
      if (!version) {
        res.status(404).json({ error: 'No active TOS version found' });
        return;
      }
      res.json(version);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve TOS version' });
    }
  }

  async acceptTOS(req: AuthRequest, res: Response): Promise<void> {
    try {
      const acceptance = await this.tosService.acceptTOS(req.tenantId, req.userId, req.body);
      res.status(201).json(acceptance);
    } catch (error) {
      res.status(500).json({ error: 'Failed to accept TOS' });
    }
  }

  async checkCompliance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await this.tosService.checkCompliance(req.tenantId, {
        user_id: req.userId,
        ip_address: req.ip,
        location_country: req.body.location_country,
        location_region: req.body.location_region
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to check compliance' });
    }
  }

  async getUserAcceptances(req: AuthRequest, res: Response): Promise<void> {
    try {
      const acceptances = await this.tosService.getUserAcceptances(req.tenantId, req.userId);
      res.json(acceptances);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve acceptances' });
    }
  }
}
