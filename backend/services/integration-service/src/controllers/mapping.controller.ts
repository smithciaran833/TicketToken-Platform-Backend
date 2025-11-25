import { FastifyRequest, FastifyReply } from 'fastify';
import { mappingService } from '../services/mapping.service';
import { db } from '../config/database';

export class MappingController {
  async getAvailableFields(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;

      const fields = await mappingService.getAvailableFields(provider);

      return reply.send({
        success: true,
        data: fields
      });
    } catch (error) {
      throw error;
    }
  }

  async getCurrentMappings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.query as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const config = await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: provider
        })
        .first();

      return reply.send({
        success: true,
        data: {
          mappings: config?.field_mappings || {},
          templateId: config?.template_id,
          templateAppliedAt: config?.template_applied_at
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async updateMappings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId, mappings } = request.body as any;

      if (!venueId || !mappings) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID and mappings are required'
        });
      }

      await mappingService.createCustomMapping(venueId, provider, mappings);

      return reply.send({
        success: true,
        message: 'Mappings updated successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  async testMappings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { mappings, sampleData } = request.body as any;

      if (!mappings || !sampleData) {
        return reply.code(400).send({
          success: false,
          error: 'Mappings and sample data are required'
        });
      }

      // Apply mappings to sample data
      const mapped = Object.entries(mappings).reduce((acc: any, [source, target]) => {
        const value = source.split('.').reduce((obj, key) => obj?.[key], sampleData);
        acc[target as string] = value;
        return acc;
      }, {});

      return reply.send({
        success: true,
        data: {
          original: sampleData,
          mapped
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async applyTemplate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId, templateId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      await mappingService.applyTemplate(venueId, provider, templateId);

      return reply.send({
        success: true,
        message: 'Template applied successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  async resetMappings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      // Reset to default template
      await mappingService.applyTemplate(venueId, provider);

      return reply.send({
        success: true,
        message: 'Mappings reset to default template'
      });
    } catch (error) {
      throw error;
    }
  }

  async healMappings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      await mappingService.healMapping(venueId, provider);

      return reply.send({
        success: true,
        message: 'Mappings healed successfully'
      });
    } catch (error) {
      throw error;
    }
  }
}

export const mappingController = new MappingController();
