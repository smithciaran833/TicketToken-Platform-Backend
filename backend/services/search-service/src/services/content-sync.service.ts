import { Client } from '@elastic/elasticsearch';
import { VenueContentModel } from '../../../venue-service/src/models/mongodb/venue-content.model';
import { EventContentModel } from '../../../event-service/src/models/mongodb/event-content.model';
import { RatingService } from '@tickettoken/shared';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

export class ContentSyncService {
  private esClient: Client;
  private ratingService: RatingService;

  constructor(esClient: Client, redis: Redis) {
    this.esClient = esClient;
    this.ratingService = new RatingService(redis);
  }

  async syncVenueContent(venueId: string): Promise<void> {
    try {
      logger.info(`[ContentSync] Syncing venue ${venueId}`);

      // Fetch all venue content from MongoDB
      const venueContent = await VenueContentModel.find({
        venueId,
        status: 'published',
      });

      // Extract data
      const amenities = this.extractAmenities(venueContent);
      const accessibility = this.extractAccessibility(venueContent);
      const images = this.extractImages(venueContent);
      const ratings = await this.getRatingSummary('venue', venueId);

      // Update Elasticsearch
      await this.esClient.update({
        index: 'venues',
        id: venueId,
        body: {
          doc: {
            amenities,
            accessibility,
            images,
            ratings,
            content_updated_at: new Date().toISOString(),
          },
        },
      });

      logger.info(`[ContentSync] Venue ${venueId} synced successfully`);
    } catch (error) {
      logger.error(`[ContentSync] Failed to sync venue ${venueId}:`, error);
      throw error;
    }
  }

  async syncEventContent(eventId: string): Promise<void> {
    try {
      logger.info(`[ContentSync] Syncing event ${eventId}`);

      // Fetch all event content from MongoDB
      const eventContent = await EventContentModel.find({
        eventId,
        status: 'published',
      });

      // Extract data
      const images = this.extractImages(eventContent);
      const performers = this.extractPerformers(eventContent);
      const lineup = this.extractLineup(eventContent);
      const ratings = await this.getRatingSummary('event', eventId);

      // Update Elasticsearch
      await this.esClient.update({
        index: 'events',
        id: eventId,
        body: {
          doc: {
            images,
            performers,
            lineup,
            ratings,
            content_updated_at: new Date().toISOString(),
          },
        },
      });

      logger.info(`[ContentSync] Event ${eventId} synced successfully`);
    } catch (error) {
      logger.error(`[ContentSync] Failed to sync event ${eventId}:`, error);
      throw error;
    }
  }

  async syncRatings(targetType: 'venue' | 'event', targetId: string): Promise<void> {
    try {
      logger.info(`[ContentSync] Syncing ratings for ${targetType} ${targetId}`);

      const ratings = await this.getRatingSummary(targetType, targetId);

      const index = targetType === 'venue' ? 'venues' : 'events';
      await this.esClient.update({
        index,
        id: targetId,
        body: {
          doc: {
            ratings,
            ratings_updated_at: new Date().toISOString(),
          },
        },
      });

      logger.info(`[ContentSync] Ratings synced for ${targetType} ${targetId}`);
    } catch (error) {
      logger.error(`[ContentSync] Failed to sync ratings:`, error);
      throw error;
    }
  }

  async bulkSyncVenues(): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    try {
      logger.info('[ContentSync] Starting bulk venue sync');

      // Get all venue IDs from Elasticsearch
      const result = await this.esClient.search({
        index: 'venues',
        size: 10000,
        _source: false,
      });

      const venueIds = result.hits.hits.map(hit => hit._id as string);
      logger.info(`[ContentSync] Found ${venueIds.length} venues to sync`);

      for (const venueId of venueIds) {
        try {
          await this.syncVenueContent(venueId);
          synced++;
        } catch (error) {
          logger.error(`[ContentSync] Failed to sync venue ${venueId}:`, error);
          failed++;
        }
      }

      logger.info(`[ContentSync] Bulk venue sync complete: ${synced} synced, ${failed} failed`);
      return { synced, failed };
    } catch (error) {
      logger.error('[ContentSync] Bulk venue sync failed:', error);
      throw error;
    }
  }

  async bulkSyncEvents(): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    try {
      logger.info('[ContentSync] Starting bulk event sync');

      // Get all event IDs from Elasticsearch
      const result = await this.esClient.search({
        index: 'events',
        size: 10000,
        _source: false,
      });

      const eventIds = result.hits.hits.map(hit => hit._id as string);
      logger.info(`[ContentSync] Found ${eventIds.length} events to sync`);

      for (const eventId of eventIds) {
        try {
          await this.syncEventContent(eventId);
          synced++;
        } catch (error) {
          logger.error(`[ContentSync] Failed to sync event ${eventId}:`, error);
          failed++;
        }
      }

      logger.info(`[ContentSync] Bulk event sync complete: ${synced} synced, ${failed} failed`);
      return { synced, failed };
    } catch (error) {
      logger.error('[ContentSync] Bulk event sync failed:', error);
      throw error;
    }
  }

  // Helper methods
  private extractAmenities(content: any[]): string[] {
    const amenities = new Set<string>();
    
    for (const item of content) {
      if (item.contentType === 'AMENITIES' && item.content?.amenities) {
        for (const amenity of item.content.amenities) {
          if (amenity.name) amenities.add(amenity.name);
        }
      }
    }
    
    return Array.from(amenities);
  }

  private extractAccessibility(content: any[]): any {
    for (const item of content) {
      if (item.contentType === 'ACCESSIBILITY' && item.content) {
        return {
          wheelchairAccessible: item.content.wheelchairAccessible || false,
          features: item.content.features || [],
          description: item.content.description || '',
        };
      }
    }
    return {
      wheelchairAccessible: false,
      features: [],
      description: '',
    };
  }

  private extractImages(content: any[]): string[] {
    const images: string[] = [];
    
    for (const item of content) {
      if (item.contentType === 'GALLERY' && item.content?.url) {
        images.push(item.content.url);
      } else if (item.contentType === 'COVER_IMAGE' && item.content?.url) {
        images.unshift(item.content.url); // Cover image first
      }
    }
    
    return images;
  }

  private extractPerformers(content: any[]): any[] {
    const performers: any[] = [];
    
    for (const item of content) {
      if (item.contentType === 'PERFORMER_BIO' && item.content) {
        performers.push({
          name: item.content.name,
          bio: item.content.bio,
          genre: item.content.genre,
          image: item.content.imageUrl,
        });
      }
    }
    
    return performers;
  }

  private extractLineup(content: any[]): any {
    for (const item of content) {
      if (item.contentType === 'LINEUP' && item.content?.acts) {
        return {
          acts: item.content.acts.map((act: any) => ({
            name: act.name,
            startTime: act.startTime,
            endTime: act.endTime,
            stage: act.stage,
          })),
        };
      }
    }
    return { acts: [] };
  }

  private async getRatingSummary(targetType: string, targetId: string): Promise<any> {
    try {
      const summary = await this.ratingService.getRatingSummary(targetType as 'venue' | 'event', targetId);
      return {
        average: summary?.averageRating || 0,
        count: summary?.totalRatings || 0,
      };
    } catch (error) {
      logger.error(`[ContentSync] Failed to get rating summary:`, error);
      return {
        average: 0,
        count: 0,
      };
    }
  }
}
