import { Types } from 'mongoose';
import { EventContentModel, IEventContent, EventContentType, EventContentStatus } from '../models/mongodb/event-content.model';
import { logger } from '../utils/logger';

export interface CreateContentInput {
  eventId: string;
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
}

export class EventContentService {
  async createContent(input: CreateContentInput): Promise<IEventContent> {
    try {
      const content = new EventContentModel({
        eventId: new Types.ObjectId(input.eventId),
        contentType: input.contentType,
        content: input.content,
        status: 'draft',
        displayOrder: input.displayOrder || 0,
        featured: input.featured || false,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });
      await content.save();
      logger.info(`[EventContent] Created content ${content._id} for event ${input.eventId}`);
      return content;
    } catch (error) {
      logger.error('[EventContent] Failed to create content:', error);
      throw error;
    }
  }

  async updateContent(contentId: string, input: UpdateContentInput): Promise<IEventContent | null> {
    try {
      const content = await EventContentModel.findById(contentId);
      if (!content) throw new Error('Content not found');
      
      if (input.content) content.content = input.content;
      if (input.displayOrder !== undefined) content.displayOrder = input.displayOrder;
      if (input.featured !== undefined) content.featured = input.featured;
      if (input.primaryImage !== undefined) content.primaryImage = input.primaryImage;
      content.updatedBy = input.updatedBy;
      content.version += 1;
      
      await content.save();
      return content;
    } catch (error) {
      logger.error('[EventContent] Failed to update:', error);
      throw error;
    }
  }

  async deleteContent(contentId: string): Promise<boolean> {
    const result = await EventContentModel.findByIdAndDelete(contentId);
    return !!result;
  }

  async getContent(contentId: string): Promise<IEventContent | null> {
    return await EventContentModel.findById(contentId);
  }

  async getEventContent(eventId: string, contentType?: EventContentType, status?: EventContentStatus): Promise<IEventContent[]> {
    const query: any = { eventId: new Types.ObjectId(eventId) };
    if (contentType) query.contentType = contentType;
    if (status) query.status = status;
    return await EventContentModel.find(query).sort({ displayOrder: 1, createdAt: -1 });
  }

  async publishContent(contentId: string, userId: string): Promise<IEventContent | null> {
    const content = await EventContentModel.findById(contentId);
    if (!content) throw new Error('Content not found');
    content.status = 'published';
    content.publishedAt = new Date();
    content.updatedBy = userId;
    await content.save();
    return content;
  }

  async archiveContent(contentId: string, userId: string): Promise<IEventContent | null> {
    const content = await EventContentModel.findById(contentId);
    if (!content) throw new Error('Content not found');
    content.status = 'archived';
    content.archivedAt = new Date();
    content.updatedBy = userId;
    await content.save();
    return content;
  }

  async getGallery(eventId: string): Promise<IEventContent[]> {
    return await EventContentModel.find({
      eventId: new Types.ObjectId(eventId),
      contentType: 'GALLERY',
      status: 'published',
    }).sort({ displayOrder: 1 });
  }

  async getLineup(eventId: string): Promise<IEventContent | null> {
    return await EventContentModel.findOne({
      eventId: new Types.ObjectId(eventId),
      contentType: 'LINEUP',
      status: 'published',
    });
  }

  async getSchedule(eventId: string): Promise<IEventContent | null> {
    return await EventContentModel.findOne({
      eventId: new Types.ObjectId(eventId),
      contentType: 'SCHEDULE',
      status: 'published',
    });
  }

  async getPerformers(eventId: string): Promise<IEventContent[]> {
    return await EventContentModel.find({
      eventId: new Types.ObjectId(eventId),
      contentType: 'PERFORMER_BIO',
      status: 'published',
    }).sort({ displayOrder: 1 });
  }
}
