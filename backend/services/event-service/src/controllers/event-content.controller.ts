import { FastifyRequest, FastifyReply } from 'fastify';
import { EventContentService } from '../services/event-content.service';
import { logger } from '../utils/logger';

export class EventContentController {
  private contentService: EventContentService;

  constructor() {
    this.contentService = new EventContentService();
  }

  createContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const { contentType, content, displayOrder, featured } = req.body as any;
      const userId = (req as any).user?.id || 'system';

      const result = await this.contentService.createContent({
        eventId,
        contentType,
        content,
        createdBy: userId,
        displayOrder,
        featured,
      });

      return reply.status(201).send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Create error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getEventContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const { contentType, status } = req.query as any;

      const content = await this.contentService.getEventContent(
        eventId,
        contentType as any,
        status as any
      );

      return reply.send({ success: true, data: content });
    } catch (error: any) {
      logger.error('[EventContentController] Get content error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const content = await this.contentService.getContent(contentId);

      if (!content) {
        return reply.status(404).send({ success: false, error: 'Content not found' });
      }

      return reply.send({ success: true, data: content });
    } catch (error: any) {
      logger.error('[EventContentController] Get content error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  updateContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const { content, displayOrder, featured, primaryImage } = req.body as any;
      const userId = (req as any).user?.id || 'system';

      const result = await this.contentService.updateContent(contentId, {
        content,
        displayOrder,
        featured,
        primaryImage,
        updatedBy: userId,
      });

      if (!result) {
        return reply.status(404).send({ success: false, error: 'Content not found' });
      }

      return reply.send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Update error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  deleteContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const result = await this.contentService.deleteContent(contentId);

      if (!result) {
        return reply.status(404).send({ success: false, error: 'Content not found' });
      }

      return reply.send({ success: true, message: 'Content deleted successfully' });
    } catch (error: any) {
      logger.error('[EventContentController] Delete error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  publishContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const userId = (req as any).user?.id || 'system';

      const result = await this.contentService.publishContent(contentId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Publish error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  archiveContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const userId = (req as any).user?.id || 'system';

      const result = await this.contentService.archiveContent(contentId, userId);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      logger.error('[EventContentController] Archive error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getGallery = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const gallery = await this.contentService.getGallery(eventId);
      return reply.send({ success: true, data: gallery });
    } catch (error: any) {
      logger.error('[EventContentController] Get gallery error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getLineup = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const lineup = await this.contentService.getLineup(eventId);
      return reply.send({ success: true, data: lineup });
    } catch (error: any) {
      logger.error('[EventContentController] Get lineup error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getSchedule = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const schedule = await this.contentService.getSchedule(eventId);
      return reply.send({ success: true, data: schedule });
    } catch (error: any) {
      logger.error('[EventContentController] Get schedule error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };

  getPerformers = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { eventId } = req.params as any;
      const performers = await this.contentService.getPerformers(eventId);
      return reply.send({ success: true, data: performers });
    } catch (error: any) {
      logger.error('[EventContentController] Get performers error:', error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  };
}
