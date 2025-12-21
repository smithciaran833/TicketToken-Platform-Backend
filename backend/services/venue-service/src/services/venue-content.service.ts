import { Types } from 'mongoose';
import { VenueContentModel, IVenueContent, VenueContentType, VenueContentStatus } from '../models/mongodb/venue-content.model';
import { logger } from '../utils/logger';

export interface CreateContentInput {
  venueId: string;
  contentType: VenueContentType;
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

export class VenueContentService {
  /**
   * Create new venue content
   */
  async createContent(input: CreateContentInput): Promise<IVenueContent> {
    try {
      const content = new VenueContentModel({
        venueId: new Types.ObjectId(input.venueId),
        contentType: input.contentType,
        content: input.content,
        status: 'draft',
        displayOrder: input.displayOrder || 0,
        featured: input.featured || false,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });

      await content.save();
      logger.info(`[VenueContent] Created content ${content._id} for venue ${input.venueId}`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to create content:', error);
      throw error;
    }
  }

  /**
   * Update existing content
   */
  async updateContent(contentId: string, input: UpdateContentInput): Promise<IVenueContent | null> {
    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      if (input.content) content.content = input.content;
      if (input.displayOrder !== undefined) content.displayOrder = input.displayOrder;
      if (input.featured !== undefined) content.featured = input.featured;
      if (input.primaryImage !== undefined) content.primaryImage = input.primaryImage;
      content.updatedBy = input.updatedBy;
      content.version += 1;

      await content.save();
      logger.info(`[VenueContent] Updated content ${contentId}`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to update content:', error);
      throw error;
    }
  }

  /**
   * Delete content
   */
  async deleteContent(contentId: string): Promise<boolean> {
    try {
      const result = await VenueContentModel.findByIdAndDelete(contentId);
      if (result) {
        logger.info(`[VenueContent] Deleted content ${contentId}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('[VenueContent] Failed to delete content:', error);
      throw error;
    }
  }

  /**
   * Get content by ID
   */
  async getContent(contentId: string): Promise<IVenueContent | null> {
    try {
      return await VenueContentModel.findById(contentId);
    } catch (error) {
      logger.error('[VenueContent] Failed to get content:', error);
      throw error;
    }
  }

  /**
   * Get all content for a venue
   */
  async getVenueContent(
    venueId: string,
    contentType?: VenueContentType,
    status?: VenueContentStatus
  ): Promise<IVenueContent[]> {
    try {
      const query: any = { venueId: new Types.ObjectId(venueId) };
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
   */
  async publishContent(contentId: string, userId: string): Promise<IVenueContent | null> {
    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      content.status = 'published';
      content.publishedAt = new Date();
      content.updatedBy = userId;

      await content.save();
      logger.info(`[VenueContent] Published content ${contentId}`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to publish content:', error);
      throw error;
    }
  }

  /**
   * Archive content
   */
  async archiveContent(contentId: string, userId: string): Promise<IVenueContent | null> {
    try {
      const content = await VenueContentModel.findById(contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      content.status = 'archived';
      content.archivedAt = new Date();
      content.updatedBy = userId;

      await content.save();
      logger.info(`[VenueContent] Archived content ${contentId}`);
      return content;
    } catch (error) {
      logger.error('[VenueContent] Failed to archive content:', error);
      throw error;
    }
  }

  /**
   * Get seating chart
   */
  async getSeatingChart(venueId: string): Promise<IVenueContent | null> {
    try {
      return await VenueContentModel.findOne({
        venueId: new Types.ObjectId(venueId),
        contentType: 'SEATING_CHART',
        status: 'published',
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get seating chart:', error);
      throw error;
    }
  }

  /**
   * Update seating chart
   */
  async updateSeatingChart(venueId: string, sections: any, userId: string): Promise<IVenueContent> {
    try {
      let chart = await VenueContentModel.findOne({
        venueId: new Types.ObjectId(venueId),
        contentType: 'SEATING_CHART',
      });

      if (chart) {
        chart.content.sections = sections;
        chart.updatedBy = userId;
        chart.version += 1;
        await chart.save();
        logger.info(`[VenueContent] Updated seating chart for venue ${venueId}`);
        return chart;
      } else {
        const newChart = await this.createContent({
          venueId,
          contentType: 'SEATING_CHART',
          content: { sections },
          createdBy: userId,
        });
        logger.info(`[VenueContent] Created seating chart for venue ${venueId}`);
        return newChart;
      }
    } catch (error) {
      logger.error('[VenueContent] Failed to update seating chart:', error);
      throw error;
    }
  }

  /**
   * Get photos
   */
  async getPhotos(venueId: string, type?: string): Promise<IVenueContent[]> {
    try {
      const query: any = {
        venueId: new Types.ObjectId(venueId),
        contentType: 'PHOTO',
        status: 'published',
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
   */
  async addPhoto(venueId: string, media: any, userId: string): Promise<IVenueContent> {
    try {
      return await this.createContent({
        venueId,
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
   */
  async getAmenities(venueId: string): Promise<IVenueContent | null> {
    try {
      return await VenueContentModel.findOne({
        venueId: new Types.ObjectId(venueId),
        contentType: 'AMENITIES',
        status: 'published',
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get amenities:', error);
      throw error;
    }
  }

  /**
   * Get accessibility info
   */
  async getAccessibilityInfo(venueId: string): Promise<IVenueContent | null> {
    try {
      return await VenueContentModel.findOne({
        venueId: new Types.ObjectId(venueId),
        contentType: 'ACCESSIBILITY_INFO',
        status: 'published',
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get accessibility info:', error);
      throw error;
    }
  }

  /**
   * Get parking info
   */
  async getParkingInfo(venueId: string): Promise<IVenueContent | null> {
    try {
      return await VenueContentModel.findOne({
        venueId: new Types.ObjectId(venueId),
        contentType: 'PARKING_INFO',
        status: 'published',
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get parking info:', error);
      throw error;
    }
  }

  /**
   * Get policies
   */
  async getPolicies(venueId: string): Promise<IVenueContent | null> {
    try {
      return await VenueContentModel.findOne({
        venueId: new Types.ObjectId(venueId),
        contentType: 'POLICIES',
        status: 'published',
      });
    } catch (error) {
      logger.error('[VenueContent] Failed to get policies:', error);
      throw error;
    }
  }
}
