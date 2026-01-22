import { Types } from 'mongoose';
import { EventContentModel, IEventContent, EventContentType, EventContentStatus } from '../models/mongodb/event-content.model';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../types';

export interface CreateContentInput {
  eventId: string;
  tenantId: string;
  contentType: EventContentType;
  content: any;
  createdBy: string;
  displayOrder?: number;
  featured?: boolean;
}

export interface UpdateContentInput {
  content?: any;
  updatedBy: string;
  displayOrder?: number;
  featured?: boolean;
  primaryImage?: boolean;
  expectedVersion?: number; // CRITICAL FIX: Add version for optimistic locking
}

/**
 * CRITICAL FIX: Custom error for version conflicts
 */
export class ContentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentConflictError';
  }
}

/**
 * SECURITY FIX: Validates tenant context and UUID format
 * Prevents cross-tenant data access and invalid tenant IDs
 */
function validateTenantContext(tenantId: string): void {
  if (!tenantId) {
    throw new ValidationError([{ field: 'tenantId', message: 'Tenant ID is required' }]);
  }

  // UUID v4 validation regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new ValidationError([{ field: 'tenantId', message: 'Invalid tenant ID format' }]);
  }
}

export class EventContentService {
  async createContent(input: CreateContentInput): Promise<IEventContent> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(input.tenantId);

    try {
      const content = new EventContentModel({
        eventId: new Types.ObjectId(input.eventId),
        tenantId: input.tenantId,
        contentType: input.contentType,
        content: input.content,
        status: 'draft',
        displayOrder: input.displayOrder || 0,
        featured: input.featured || false,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        version: 1, // Start at version 1
      });
      await content.save();
      logger.info(`[EventContent] Created content ${content._id} for event ${input.eventId} (tenant: ${input.tenantId})`);
      return content;
    } catch (error) {
      logger.error('[EventContent] Failed to create content:', error);
      throw error;
    }
  }

  async updateContent(contentId: string, tenantId: string, input: UpdateContentInput): Promise<IEventContent | null> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    try {
      const content = await EventContentModel.findOne({ _id: contentId, tenantId });
      if (!content) {
        throw new NotFoundError('Content'); // CRITICAL FIX: Use custom error
      }

      // CRITICAL FIX: Optimistic locking - check version if provided
      if (input.expectedVersion !== undefined && content.version !== input.expectedVersion) {
        throw new ContentConflictError(
          `Content ${contentId} was modified by another user. ` +
          `Expected version ${input.expectedVersion}, but current version is ${content.version}. ` +
          `Please refresh and try again.`
        );
      }

      if (input.content) content.content = input.content;
      if (input.displayOrder !== undefined) content.displayOrder = input.displayOrder;
      if (input.featured !== undefined) content.featured = input.featured;
      if (input.primaryImage !== undefined) content.primaryImage = input.primaryImage;
      content.updatedBy = input.updatedBy;
      
      // CRITICAL FIX: Increment version AFTER checking
      content.version += 1;

      await content.save();
      
      logger.info(`[EventContent] Updated content ${contentId} to version ${content.version}`);
      
      return content;
    } catch (error) {
      logger.error('[EventContent] Failed to update:', error);
      throw error;
    }
  }

  async deleteContent(contentId: string, tenantId: string): Promise<boolean> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    const result = await EventContentModel.findOneAndDelete({ _id: contentId, tenantId });
    if (!result) {
      throw new NotFoundError('Content'); // CRITICAL FIX: Use custom error
    }
    return true;
  }

  async getContent(contentId: string, tenantId: string): Promise<IEventContent | null> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    const content = await EventContentModel.findOne({ _id: contentId, tenantId });
    if (!content) {
      throw new NotFoundError('Content'); // CRITICAL FIX: Use custom error
    }
    return content;
  }

  async getEventContent(eventId: string, tenantId: string, contentType?: EventContentType, status?: EventContentStatus): Promise<IEventContent[]> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    const query: any = { eventId: new Types.ObjectId(eventId), tenantId };
    if (contentType) query.contentType = contentType;
    if (status) query.status = status;
    return await EventContentModel.find(query).sort({ displayOrder: 1, createdAt: -1 });
  }

  async publishContent(contentId: string, tenantId: string, userId: string): Promise<IEventContent | null> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    const content = await EventContentModel.findOne({ _id: contentId, tenantId });
    if (!content) {
      throw new NotFoundError('Content'); // CRITICAL FIX: Use custom error
    }
    
    content.status = 'published';
    content.publishedAt = new Date();
    content.updatedBy = userId;
    content.version += 1; // Increment version on publish
    
    await content.save();
    return content;
  }

  async archiveContent(contentId: string, tenantId: string, userId: string): Promise<IEventContent | null> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    const content = await EventContentModel.findOne({ _id: contentId, tenantId });
    if (!content) {
      throw new NotFoundError('Content'); // CRITICAL FIX: Use custom error
    }
    
    content.status = 'archived';
    content.archivedAt = new Date();
    content.updatedBy = userId;
    content.version += 1; // Increment version on archive
    
    await content.save();
    return content;
  }

  async getGallery(eventId: string, tenantId: string): Promise<IEventContent[]> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    return await EventContentModel.find({
      eventId: new Types.ObjectId(eventId),
      tenantId,
      contentType: 'GALLERY',
      status: 'published',
    }).sort({ displayOrder: 1 });
  }

  async getLineup(eventId: string, tenantId: string): Promise<IEventContent | null> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    return await EventContentModel.findOne({
      eventId: new Types.ObjectId(eventId),
      tenantId,
      contentType: 'LINEUP',
      status: 'published',
    });
  }

  async getSchedule(eventId: string, tenantId: string): Promise<IEventContent | null> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    return await EventContentModel.findOne({
      eventId: new Types.ObjectId(eventId),
      tenantId,
      contentType: 'SCHEDULE',
      status: 'published',
    });
  }

  async getPerformers(eventId: string, tenantId: string): Promise<IEventContent[]> {
    // SECURITY FIX: Validate tenant context
    validateTenantContext(tenantId);

    return await EventContentModel.find({
      eventId: new Types.ObjectId(eventId),
      tenantId,
      contentType: 'PERFORMER_BIO',
      status: 'published',
    }).sort({ displayOrder: 1 });
  }
}
