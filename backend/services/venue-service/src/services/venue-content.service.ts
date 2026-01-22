import { Types } from 'mongoose';
import { Knex } from 'knex';
import { VenueContentModel, IVenueContent, VenueContentType, VenueContentStatus } from '../models/mongodb/venue-content.model';
import { ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { CacheService } from './cache.service';

export interface CreateContentInput {
  venueId: string;
  tenantId: string;
  contentType: VenueContentType;
  content: any;
  createdBy: string;
  displayOrder?: number;
  featured?: boolean;
}

export interface UpdateContentInput {
  tenantId: string;
  content?: any;
  updatedBy: string;
  displayOrder?: number;
  featured?: boolean;
  primaryImage?: boolean;
}

/**
 * SECURITY FIX: VenueContentService with tenant isolation
 * CACHE FIX: Added cache invalidation on content operations
 * - All methods now require tenantId parameter
 * - Venue ownership validation before any MongoDB operations
 * - Pattern follows venue-operations.service.ts (GOLD STANDARD)
 */
export class VenueContentService {
  private db: Knex;
  private cacheService: CacheService;

  constructor(db: Knex, cacheService: CacheService) {
    this.db = db;
    this.cacheService = cacheService;
  }

  /**
   * SECURITY FIX: Validate tenant context (copied from venue-operations.service.ts)
   */
  private validateTenantContext(tenantId: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for venue content operations');
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  /**
   * SECURITY FIX: Verify venue belongs to tenant before MongoDB operations
   * Since MongoDB doesn't have RLS, we validate against PostgreSQL first
   */
  private async verifyVenueOwnership(venueId: string, tenantId: string): Promise<void> {
    const venue = await this.db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (!venue) {
      throw new ForbiddenError('Access denied to this venue');
    }
  }

  /**
   * PHASE 3 FIX: Log content changes to audit trail
   */
  private async logAudit(
    contentId: string,
    tenantId: string,
    action: string,
    userId: string | undefined,
    changes: any = {}
  ): Promise<void> {
    try {
      await this.db('content_audit_log').insert({
        content_id: contentId,
        tenant_id: tenantId,
        action,
        user_id: userId,
        changes,
        created_at: new Date()
      });
    } catch (error) {
      // Log but don't throw - audit failures shouldn't break the operation
      logger.error('[VenueContent] Failed to log audit entry:', error);
    }
  }

  /**
   * Create new venue content
   * SECURITY FIX: Added tenant validation
   * CACHE FIX: Clear cache after creation
   */
  async createContent(input: CreateContentInput): Promise<IVenueContent> {
    this.validateTenantContext(input.tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant before creating content
      await this.verifyVenueOwnership(input.venueId, input.tenantId);

      const content = new VenueContentModel({
        venueId: input.venueId,
        tenantId: input.tenantId,
        contentType: input.contentType,
        content: input.content,
        status: 'draft',
        displayOrder: input.displayOrder || 0,
        featured: input.featured || false,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });

      await content.save();

      // PHASE 3 FIX: Log content creation
      await this.logAudit(content._id.toString(), input.tenantId, 'create', input.createdBy, {
        contentType: input.contentType,
        venueId: input.venueId
      });

      // CACHE FIX: Clear venue cache after creating content
      await this.cacheService.clearVenueCache(input.venueId, input.tenantId);

      logger.info(`[VenueContent] Created content ${content._id} for venue ${input.venueId} (tenant: ${input.tenantId})`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to create content:', error);
      throw error;
    }
  }

  /**
   * Update existing content
   * SECURITY FIX: Added tenant validation
   * PHASE 2 FIX: Added version field concurrency control
   * CACHE FIX: Clear cache after update
   */
  async updateContent(contentId: string, input: UpdateContentInput): Promise<IVenueContent | null> {
    this.validateTenantContext(input.tenantId);

    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      // SECURITY: Verify venue belongs to tenant before updating
      await this.verifyVenueOwnership(content.venueId, input.tenantId);


      if (input.content) content.content = input.content;
      if (input.displayOrder !== undefined) content.displayOrder = input.displayOrder;
      if (input.featured !== undefined) content.featured = input.featured;
      if (input.primaryImage !== undefined) content.primaryImage = input.primaryImage;
      content.updatedBy = input.updatedBy;

      await content.save();


      // CACHE FIX: Clear venue cache after updating content
      await this.cacheService.clearVenueCache(content.venueId, input.tenantId);

      logger.info(`[VenueContent] Updated content ${contentId} (tenant: ${input.tenantId})`);
      return content;
    } catch (error) {
      // Check for Mongoose VersionError
      if (error instanceof Error && error.name === 'VersionError') {
        throw new Error('Document was modified by another user. Please refresh and try again.');
      }
      logger.error('[VenueContent] Failed to update content:', error);
      throw error;
    }
  }

  /**
   * Delete content
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Soft delete instead of hard delete
   * CACHE FIX: Clear cache after deletion
   */
  async deleteContent(contentId: string, tenantId: string): Promise<boolean> {
    this.validateTenantContext(tenantId);

    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content || content.deletedAt) {
        return false;
      }

      // SECURITY: Verify venue belongs to tenant before deleting
      await this.verifyVenueOwnership(content.venueId, tenantId);

      // PHASE 3 FIX: Soft delete - set deletedAt and status
      content.deletedAt = new Date();
      content.status = 'archived';
      await content.save();

      // PHASE 3 FIX: Log content deletion
      await this.logAudit(contentId, tenantId, 'delete', undefined, {
        contentType: content.contentType
      });

      // CACHE FIX: Clear venue cache after deleting content
      await this.cacheService.clearVenueCache(content.venueId, tenantId);

      logger.info(`[VenueContent] Soft deleted content ${contentId} (tenant: ${tenantId})`);
      return true;
    } catch (error) {
      logger.error('[VenueContent] Failed to delete content:', error);
      throw error;
    }
  }

  /**
   * Get content by ID
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getContent(contentId: string, tenantId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content || content.deletedAt) {
        return null;
      }

      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(content.venueId, tenantId);

      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to get content:', error);
      throw error;
    }
  }

  /**
   * Get all content for a venue
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getVenueContent(
    venueId: string,
    tenantId: string,
    contentType?: VenueContentType,
    status?: VenueContentStatus
  ): Promise<IVenueContent[]> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant before querying content
      await this.verifyVenueOwnership(venueId, tenantId);

      const query: any = {
        venueId: venueId,
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      };
      if (contentType) query.contentType = contentType;
      if (status) query.status = status;

      return await VenueContentModel.find(query).sort({ displayOrder: 1, createdAt: -1 });
    } catch (error) {
      logger.error('[VenueContent] Failed to get venue content:', error);
      throw error;
    }
  }

  /**
   * Publish content
   * SECURITY FIX: Added tenant validation
   * CACHE FIX: Clear cache after publishing
   */
  async publishContent(contentId: string, tenantId: string, userId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(content.venueId, tenantId);

      content.status = 'published';
      content.publishedAt = new Date();
      content.updatedBy = userId;

      await content.save();

      // PHASE 3 FIX: Log content publication
      await this.logAudit(contentId, tenantId, 'publish', userId, {
        contentType: content.contentType
      });

      // CACHE FIX: Clear venue cache after publishing content
      await this.cacheService.clearVenueCache(content.venueId, tenantId);

      logger.info(`[VenueContent] Published content ${contentId} (tenant: ${tenantId})`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to publish content:', error);
      throw error;
    }
  }

  /**
   * Archive content
   * SECURITY FIX: Added tenant validation
   * CACHE FIX: Clear cache after archiving
   */
  async archiveContent(contentId: string, tenantId: string, userId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(content.venueId, tenantId);

      content.status = 'archived';
      content.archivedAt = new Date();
      content.updatedBy = userId;

      await content.save();

      // CACHE FIX: Clear venue cache after archiving content
      await this.cacheService.clearVenueCache(content.venueId, tenantId);

      logger.info(`[VenueContent] Archived content ${contentId} (tenant: ${tenantId})`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to archive content:', error);
      throw error;
    }
  }

  /**
   * Get seating chart
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getSeatingChart(venueId: string, tenantId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      return await VenueContentModel.findOne({
        venueId: venueId,
        contentType: 'SEATING_CHART',
        status: 'published',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get seating chart:', error);
      throw error;
    }
  }

  /**
   * Update seating chart
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   * CACHE FIX: Clear cache after update
   */
  async updateSeatingChart(venueId: string, tenantId: string, sections: any, userId: string): Promise<IVenueContent> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      let chart = await VenueContentModel.findOne({
        venueId: venueId,
        contentType: 'SEATING_CHART',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      });

      if (chart) {
        chart.content.sections = sections;
        chart.updatedBy = userId;
        await chart.save();

        // CACHE FIX: Clear venue cache after updating seating chart
        await this.cacheService.clearVenueCache(venueId, tenantId);

        logger.info(`[VenueContent] Updated seating chart for venue ${venueId} (tenant: ${tenantId})`);
        return chart;
      } else {
        const newChart = await this.createContent({
          venueId,
          tenantId,
          contentType: 'SEATING_CHART',
          content: { sections },
          createdBy: userId,
        });
        // Cache cleared by createContent
        logger.info(`[VenueContent] Created seating chart for venue ${venueId} (tenant: ${tenantId})`);
        return newChart;
      }
    } catch (error) {
      logger.error('[VenueContent] Failed to update seating chart:', error);
      throw error;
    }
  }

  /**
   * Get photos
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getPhotos(venueId: string, tenantId: string, type?: string): Promise<IVenueContent[]> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      const query: any = {
        venueId: venueId,
        contentType: 'PHOTO',
        status: 'published',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      };
      if (type) query['content.media.type'] = type;

      return await VenueContentModel.find(query).sort({ featured: -1, displayOrder: 1 });
    } catch (error) {
      logger.error('[VenueContent] Failed to get photos:', error);
      throw error;
    }
  }

  /**
   * Add photo
   * SECURITY FIX: Added tenant validation
   * CACHE FIX: Cleared by createContent
   */
  async addPhoto(venueId: string, tenantId: string, media: any, userId: string): Promise<IVenueContent> {
    this.validateTenantContext(tenantId);

    try {
      return await this.createContent({
        venueId,
        tenantId,
        contentType: 'PHOTO',
        content: { media },
        createdBy: userId,
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to add photo:', error);
      throw error;
    }
  }

  /**
   * Get amenities
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getAmenities(venueId: string, tenantId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      return await VenueContentModel.findOne({
        venueId: venueId,
        contentType: 'AMENITIES',
        status: 'published',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get amenities:', error);
      throw error;
    }
  }

  /**
   * Get accessibility info
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getAccessibilityInfo(venueId: string, tenantId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      return await VenueContentModel.findOne({
        venueId: venueId,
        contentType: 'ACCESSIBILITY_INFO',
        status: 'published',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get accessibility info:', error);
      throw error;
    }
  }

  /**
   * Get parking info
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getParkingInfo(venueId: string, tenantId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      return await VenueContentModel.findOne({
        venueId: venueId,
        contentType: 'PARKING_INFO',
        status: 'published',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get parking info:', error);
      throw error;
    }
  }

  /**
   * Get policies
   * SECURITY FIX: Added tenant validation
   * PHASE 3 FIX: Filter out soft-deleted content
   */
  async getPolicies(venueId: string, tenantId: string): Promise<IVenueContent | null> {
    this.validateTenantContext(tenantId);

    try {
      // SECURITY: Verify venue belongs to tenant
      await this.verifyVenueOwnership(venueId, tenantId);

      return await VenueContentModel.findOne({
        venueId: venueId,
        contentType: 'POLICIES',
        status: 'published',
        deletedAt: null // PHASE 3 FIX: Exclude soft-deleted content
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get policies:', error);
      throw error;
    }
  }
}
