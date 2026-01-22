import { FastifyRequest, FastifyReply } from 'fastify';
import { VenueContentService } from '../services/venue-content.service';
import { getTenantId } from '../middleware/tenant.middleware';
import { UnauthorizedError } from '../utils/errors';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { initializeCache } from '../services/cache.service';
import { getRedis } from '../config/redis';

/**
 * SECURITY FIX: VenueContentController updated to pass tenantId to all service calls
 * SECURITY FIX: Requires authentication - no 'system' fallback
 * CACHE FIX: Initialize with cacheService to enable cache invalidation
 * All methods now extract tenantId from request and pass it through to service layer
 */
export class VenueContentController {
  private contentService: VenueContentService;

  constructor() {
    // CACHE FIX: Initialize cacheService and pass to VenueContentService
    const redis = getRedis();
    const cacheService = initializeCache(redis);
    this.contentService = new VenueContentService(db, cacheService);
  }

  /**
   * Create venue content
   * POST /api/venues/:venueId/content
   */
  createContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const { contentType, content, displayOrder, featured } = req.body as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userId = (req as any).user.id;
      const tenantId = getTenantId(req);

      const result = await this.contentService.createContent({
        venueId,
        tenantId,
        contentType,
        content,
        createdBy: userId,
        displayOrder,
        featured,
      });

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Create content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to create content',
      });
    }
  };

  /**
   * Get venue content
   * GET /api/venues/:venueId/content
   */
  getVenueContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const { contentType, status } = req.query as any;
      const tenantId = getTenantId(req);

      const content = await this.contentService.getVenueContent(
        venueId,
        tenantId,
        contentType as any,
        status as any
      );

      return reply.send({
        success: true,
        data: content,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get content',
      });
    }
  };

  /**
   * Get content by ID
   * GET /api/venues/:venueId/content/:contentId
   */
  getContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const tenantId = getTenantId(req);

      const content = await this.contentService.getContent(contentId, tenantId);

      if (!content) {
        return reply.status(404).send({
          success: false,
          error: 'Content not found',
        });
      }

      return reply.send({
        success: true,
        data: content,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get content',
      });
    }
  };

  /**
   * Update content
   * PUT /api/venues/:venueId/content/:contentId
   */
  updateContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      const { content, displayOrder, featured, primaryImage } = req.body as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userId = (req as any).user.id;
      const tenantId = getTenantId(req);

      const result = await this.contentService.updateContent(contentId, {
        tenantId,
        content,
        displayOrder,
        featured,
        primaryImage,
        updatedBy: userId,
      });

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: 'Content not found',
        });
      }

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Update content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to update content',
      });
    }
  };

  /**
   * Delete content
   * DELETE /api/venues/:venueId/content/:contentId
   */
  deleteContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const tenantId = getTenantId(req);

      const result = await this.contentService.deleteContent(contentId, tenantId);

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: 'Content not found',
        });
      }

      return reply.send({
        success: true,
        message: 'Content deleted successfully',
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Delete content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to delete content',
      });
    }
  };

  /**
   * Publish content
   * POST /api/venues/:venueId/content/:contentId/publish
   */
  publishContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userId = (req as any).user.id;
      const tenantId = getTenantId(req);

      const result = await this.contentService.publishContent(contentId, tenantId, userId);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Publish content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to publish content',
      });
    }
  };

  /**
   * Archive content
   * POST /api/venues/:venueId/content/:contentId/archive
   */
  archiveContent = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { contentId } = req.params as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userId = (req as any).user.id;
      const tenantId = getTenantId(req);

      const result = await this.contentService.archiveContent(contentId, tenantId, userId);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Archive content error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to archive content',
      });
    }
  };

  /**
   * Get seating chart
   * GET /api/venues/:venueId/seating-chart
   */
  getSeatingChart = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const tenantId = getTenantId(req);

      const chart = await this.contentService.getSeatingChart(venueId, tenantId);

      if (!chart) {
        return reply.status(404).send({
          success: false,
          error: 'Seating chart not found',
        });
      }

      return reply.send({
        success: true,
        data: chart,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get seating chart error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get seating chart',
      });
    }
  };

  /**
   * Update seating chart
   * PUT /api/venues/:venueId/seating-chart
   */
  updateSeatingChart = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const { sections } = req.body as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userId = (req as any).user.id;
      const tenantId = getTenantId(req);

      const result = await this.contentService.updateSeatingChart(venueId, tenantId, sections, userId);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Update seating chart error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to update seating chart',
      });
    }
  };

  /**
   * Get photos
   * GET /api/venues/:venueId/photos
   */
  getPhotos = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const { type } = req.query as any;
      const tenantId = getTenantId(req);

      const photos = await this.contentService.getPhotos(venueId, tenantId, type as string);

      return reply.send({
        success: true,
        data: photos,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get photos error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get photos',
      });
    }
  };

  /**
   * Add photo
   * POST /api/venues/:venueId/photos
   */
  addPhoto = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const { media } = req.body as any;
      
      // SECURITY FIX: Require authentication
      if (!(req as any).user?.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userId = (req as any).user.id;
      const tenantId = getTenantId(req);

      const result = await this.contentService.addPhoto(venueId, tenantId, media, userId);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Add photo error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to add photo',
      });
    }
  };

  /**
   * Get amenities
   * GET /api/venues/:venueId/amenities
   */
  getAmenities = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const tenantId = getTenantId(req);

      const amenities = await this.contentService.getAmenities(venueId, tenantId);

      return reply.send({
        success: true,
        data: amenities,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get amenities error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get amenities',
      });
    }
  };

  /**
   * Get accessibility info
   * GET /api/venues/:venueId/accessibility
   */
  getAccessibility = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const tenantId = getTenantId(req);

      const info = await this.contentService.getAccessibilityInfo(venueId, tenantId);

      return reply.send({
        success: true,
        data: info,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get accessibility error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get accessibility info',
      });
    }
  };

  /**
   * Get parking info
   * GET /api/venues/:venueId/parking
   */
  getParkingInfo = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const tenantId = getTenantId(req);

      const info = await this.contentService.getParkingInfo(venueId, tenantId);

      return reply.send({
        success: true,
        data: info,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get parking info error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get parking info',
      });
    }
  };

  /**
   * Get policies
   * GET /api/venues/:venueId/policies
   */
  getPolicies = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { venueId } = req.params as any;
      const tenantId = getTenantId(req);

      const policies = await this.contentService.getPolicies(venueId, tenantId);

      return reply.send({
        success: true,
        data: policies,
      });
    } catch (error: any) {
      logger.error('[VenueContentController] Get policies error:', error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to get policies',
      });
    }
  };
}
