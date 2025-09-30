import { Request, Response, NextFunction } from 'express';
import { mappingService } from '../services/mapping.service';
import { db } from '../config/database';

export class MappingController {
  async getAvailableFields(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      
      const fields = await mappingService.getAvailableFields(provider);
      
      res.json({
        success: true,
        data: fields
      });
    } catch (error) {
      next(error);
    }
  }

  async getCurrentMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.query;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      const config = await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .first();
      
      res.json({
        success: true,
        data: {
          mappings: config?.field_mappings || {},
          templateId: config?.template_id,
          templateAppliedAt: config?.template_applied_at
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId, mappings } = req.body;
      
      if (!venueId || !mappings) {
        res.status(400).json({
          success: false,
          error: 'Venue ID and mappings are required'
        });
        return;
      }

      await mappingService.createCustomMapping(venueId, provider, mappings);
      
      res.json({
        success: true,
        message: 'Mappings updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async testMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Provider not needed for testing mappings
      const { mappings, sampleData } = req.body;
      
      if (!mappings || !sampleData) {
        res.status(400).json({
          success: false,
          error: 'Mappings and sample data are required'
        });
        return;
      }

      // Apply mappings to sample data
      const mapped = Object.entries(mappings).reduce((acc: any, [source, target]) => {
        const value = source.split('.').reduce((obj, key) => obj?.[key], sampleData);
        acc[target as string] = value;
        return acc;
      }, {});
      
      res.json({
        success: true,
        data: {
          original: sampleData,
          mapped
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async applyTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId, templateId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      await mappingService.applyTemplate(venueId, provider, templateId);
      
      res.json({
        success: true,
        message: 'Template applied successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async resetMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      // Reset to default template
      await mappingService.applyTemplate(venueId, provider);
      
      res.json({
        success: true,
        message: 'Mappings reset to default template'
      });
    } catch (error) {
      next(error);
    }
  }

  async healMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      await mappingService.healMapping(venueId, provider);
      
      res.json({
        success: true,
        message: 'Mappings healed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const mappingController = new MappingController();
