import { Knex } from 'knex';
import pino from 'pino';
import { MongoClient } from 'mongodb';
import { EnrichedEvent } from '../types/enriched-documents';
import { RatingService } from '@tickettoken/shared';

/**
 * Event Enrichment Service
 * Pulls data from PostgreSQL (events, event_performers, performers, venues) and MongoDB (event_content, ratings)
 * to create fully enriched event documents for Elasticsearch
 */
export class EventEnrichmentService {
  private db: Knex;
  private mongodb: MongoClient;
  private logger: pino.Logger;
  private ratingService: RatingService;

  constructor({ db, mongodb, logger, ratingService }: any) {
    this.db = db;
    this.mongodb = mongodb;
    this.logger = logger;
    this.ratingService = ratingService;
  }

  /**
   * Enrich a single event with full PostgreSQL + MongoDB data
   */
  async enrich(eventId: string): Promise<EnrichedEvent> {
    try {
      // Get PostgreSQL event data
      const event = await this.db('events')
        .where({ id: eventId })
        .first();

      if (!event) {
        throw new Error(`Event not found: ${eventId}`);
      }

      // Get venue data
      const venue = await this.db('venues')
        .where({ id: event.venue_id })
        .first();

      // Get performers
      const eventPerformers = await this.db('event_performers')
        .join('performers', 'event_performers.performer_id', 'performers.id')
        .where({ 'event_performers.event_id': eventId })
        .select(
          'performers.id as performerId',
          'performers.name',
          'performers.genre',
          'event_performers.headliner',
          'event_performers.billing_order'
        )
        .orderBy('event_performers.billing_order', 'asc');

      // Get ticket pricing stats
      const pricingStats = await this.db('tickets')
        .where({ event_id: eventId })
        .select(
          this.db.raw('MIN(price) as min_price'),
          this.db.raw('MAX(price) as max_price'),
          this.db.raw('AVG(price) as avg_price'),
          this.db.raw('COUNT(*) as total_tickets'),
          this.db.raw('SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as sold_tickets', ['sold'])
        )
        .first();

      // Get MongoDB content
      const mongoDb = this.mongodb.db();
      const eventContent = await mongoDb
        .collection('event_content')
        .findOne({ eventId });

      // Get ratings from MongoDB via RatingService
      const ratings = await this.getRatings(eventId);

      // Build enriched event document
      const enriched: EnrichedEvent = {
        eventId: event.id,
        title: event.name || event.title,
        description: eventContent?.description || event.description || '',
        category: event.category || 'other',
        subcategory: event.subcategory,
        tags: eventContent?.tags || event.tags || [],

        eventDate: event.date || event.event_date,
        endDate: event.end_date || eventContent?.endDate,
        status: event.status || 'active',
        featured: event.featured || false,

        venue: {
          venueId: venue?.id || event.venue_id,
          name: venue?.name || '',
          city: venue?.address?.city || venue?.city || '',
          state: venue?.address?.state || venue?.state || '',
          country: venue?.address?.country || venue?.country || 'USA',
          location: venue?.location
            ? { lat: venue.location.lat || venue.location.latitude, lon: venue.location.lon || venue.location.longitude }
            : undefined,
          address: venue?.address?.street || ''
        },

        performers: eventPerformers.map(p => ({
          performerId: p.performerId,
          name: p.name,
          headliner: p.headliner || false,
          genre: p.genre
        })),

        pricing: pricingStats ? {
          minPrice: pricingStats.min_price,
          maxPrice: pricingStats.max_price,
          averagePrice: pricingStats.avg_price,
          currency: event.currency || 'USD'
        } : undefined,

        capacity: venue?.capacity || eventContent?.capacity,
        ticketsSold: pricingStats?.sold_tickets || 0,

        images: eventContent?.images?.map((img: any) => ({
          url: img.url,
          type: img.type || 'photo',
          primary: img.primary || false
        })) || [],

        metadata: {
          createdAt: event.created_at,
          updatedAt: event.updated_at,
          createdBy: event.created_by,
          source: event.source || 'internal',
          externalId: event.external_id
        },

        searchBoost: this.calculateSearchBoost(event, ratings, pricingStats),
        visibility: event.visibility || 'public'
      };

      return enriched;
    } catch (error) {
      this.logger.error({ error, eventId }, 'Failed to enrich event');
      throw error;
    }
  }

  /**
   * Bulk enrich multiple events
   */
  async bulkEnrich(eventIds: string[]): Promise<EnrichedEvent[]> {
    const enriched: EnrichedEvent[] = [];

    for (const eventId of eventIds) {
      try {
        const event = await this.enrich(eventId);
        enriched.push(event);
      } catch (error) {
        this.logger.error({ error, eventId }, 'Failed to enrich event in bulk');
        // Continue with other events
      }
    }

    return enriched;
  }

  /**
   * Get ratings from MongoDB via RatingService
   */
  private async getRatings(eventId: string): Promise<{ averageRating?: number; totalReviews?: number }> {
    try {
      const stats = await this.ratingService.getRatingSummary('event', eventId);

      if (!stats) {
        return {};
      }

      return {
        averageRating: stats.averageRating,
        totalReviews: stats.totalRatings
      };
    } catch (error) {
      this.logger.warn({ error, eventId }, 'Failed to get event ratings');
      return {};
    }
  }

  /**
   * Calculate search boost based on event attributes
   */
  private calculateSearchBoost(event: any, ratings: any, pricingStats: any): number {
    let boost = 1.0;

    // Boost featured events
    if (event.featured) {
      boost += 0.5;
    }

    // Boost highly rated events
    if (ratings?.averageRating) {
      if (ratings.averageRating >= 4.5) {
        boost += 0.3;
      } else if (ratings.averageRating >= 4.0) {
        boost += 0.2;
      } else if (ratings.averageRating >= 3.5) {
        boost += 0.1;
      }
    }

    // Boost events with many reviews
    if (ratings?.totalReviews) {
      if (ratings.totalReviews >= 50) {
        boost += 0.2;
      } else if (ratings.totalReviews >= 20) {
        boost += 0.15;
      } else if (ratings.totalReviews >= 10) {
        boost += 0.1;
      }
    }

    // Boost events with high ticket sales
    if (pricingStats) {
      const sellThroughRate = pricingStats.sold_tickets / pricingStats.total_tickets;
      if (sellThroughRate >= 0.9) {
        boost += 0.3;
      } else if (sellThroughRate >= 0.75) {
        boost += 0.2;
      } else if (sellThroughRate >= 0.5) {
        boost += 0.1;
      }
    }

    // Boost upcoming events (within 30 days)
    const eventDate = new Date(event.date || event.event_date);
    const daysUntilEvent = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilEvent > 0 && daysUntilEvent <= 7) {
      boost += 0.3; // Events happening this week
    } else if (daysUntilEvent > 0 && daysUntilEvent <= 30) {
      boost += 0.2; // Events happening this month
    }

    return boost;
  }
}
