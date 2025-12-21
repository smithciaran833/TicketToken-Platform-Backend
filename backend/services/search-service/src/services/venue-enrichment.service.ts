import { Knex } from 'knex';
import pino from 'pino';
import { MongoClient } from 'mongodb';
import { EnrichedVenue } from '../types/enriched-documents';
import { RatingService } from '@tickettoken/shared';

/**
 * Venue Enrichment Service
 * Pulls data from PostgreSQL (venues, venue_sections) and MongoDB (venue_content, ratings)
 * to create fully enriched venue documents for Elasticsearch
 */
export class VenueEnrichmentService {
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
   * Enrich a single venue with full PostgreSQL + MongoDB data
   */
  async enrich(venueId: string): Promise<EnrichedVenue> {
    try {
      // Get PostgreSQL venue data
      const venue = await this.db('venues')
        .where({ id: venueId })
        .first();

      if (!venue) {
        throw new Error(`Venue not found: ${venueId}`);
      }

      // Get venue sections from PostgreSQL
      const sections = await this.db('venue_sections')
        .where({ venue_id: venueId })
        .select('*');

      // Get MongoDB content
      const mongoDb = this.mongodb.db();
      const venueContent = await mongoDb
        .collection('venue_content')
        .findOne({ venueId });

      // Get ratings from MongoDB via RatingService
      const ratings = await this.getRatings(venueId);

      // Build enriched venue document
      const enriched: EnrichedVenue = {
        venueId: venue.id,
        name: venue.name,
        description: venueContent?.description || venue.description || '',
        type: venue.type || 'venue',

        address: {
          street: venue.address?.street || '',
          city: venue.address?.city || venue.city || '',
          state: venue.address?.state || venue.state || '',
          zipCode: venue.address?.zipCode || venue.zip_code || '',
          country: venue.address?.country || venue.country || 'USA',
          fullAddress: venue.address
            ? `${venue.address.street}, ${venue.address.city}, ${venue.address.state} ${venue.address.zipCode}`
            : ''
        },

        location: venue.location
          ? { lat: venue.location.lat || venue.location.latitude, lon: venue.location.lon || venue.location.longitude }
          : undefined,

        timezone: venue.timezone || venueContent?.timezone,
        capacity: venue.capacity,

        // Map sections from PostgreSQL
        sections: sections.map(s => ({
          sectionId: s.id,
          name: s.name,
          capacity: s.capacity,
          type: s.type || 'general',
          pricing: s.base_price || s.pricing
        })),

        // From MongoDB venue_content
        amenities: venueContent?.amenities || [],
        accessibilityFeatures: venueContent?.accessibilityFeatures || venueContent?.accessibility || [],

        images: venueContent?.images?.map((img: any) => ({
          url: img.url,
          type: img.type || 'photo',
          caption: img.caption,
          primary: img.primary || false
        })) || [],

        ratings,

        contact: venueContent?.contact || {
          phone: venue.phone,
          email: venue.email,
          website: venue.website
        },

        operatingHours: venueContent?.operatingHours || venue.operating_hours,

        parkingInfo: venueContent?.parkingInfo || {
          onsite: venue.parking_onsite,
          capacity: venue.parking_capacity,
          pricing: venue.parking_price,
          valet: venue.parking_valet
        },

        policies: venueContent?.policies || {
          ageRestrictions: venue.age_restrictions,
          bagPolicy: venue.bag_policy,
          smokingPolicy: venue.smoking_policy
        },

        metadata: {
          createdAt: venue.created_at,
          updatedAt: venue.updated_at,
          lastVerified: venueContent?.lastVerified,
          source: venue.source || 'internal'
        },

        status: venue.is_active ? 'active' : 'inactive',
        featured: venue.featured || false,
        searchBoost: this.calculateSearchBoost(venue, ratings)
      };

      return enriched;
    } catch (error) {
      this.logger.error({ error, venueId }, 'Failed to enrich venue');
      throw error;
    }
  }

  /**
   * Bulk enrich multiple venues
   */
  async bulkEnrich(venueIds: string[]): Promise<EnrichedVenue[]> {
    const enriched: EnrichedVenue[] = [];

    for (const venueId of venueIds) {
      try {
        const venue = await this.enrich(venueId);
        enriched.push(venue);
      } catch (error) {
        this.logger.error({ error, venueId }, 'Failed to enrich venue in bulk');
        // Continue with other venues
      }
    }

    return enriched;
  }

  /**
   * Get ratings from MongoDB via RatingService
   */
  private async getRatings(venueId: string): Promise<EnrichedVenue['ratings']> {
    try {
      const stats = await this.ratingService.getRatingSummary('venue', venueId);

      if (!stats) {
        return undefined;
      }

      return {
        averageRating: stats.averageRating,
        totalReviews: stats.totalRatings,
        categories: {
          accessibility: stats.categoryAverages?.accessibility,
          sound: stats.categoryAverages?.sound,
          parking: stats.categoryAverages?.parking,
          concessions: stats.categoryAverages?.foodAndDrink,
          sightlines: stats.categoryAverages?.sightlines
        }
      };
    } catch (error) {
      this.logger.warn({ error, venueId }, 'Failed to get venue ratings');
      return undefined;
    }
  }

  /**
   * Calculate search boost based on venue attributes
   */
  private calculateSearchBoost(venue: any, ratings?: EnrichedVenue['ratings']): number {
    let boost = 1.0;

    // Boost featured venues
    if (venue.featured) {
      boost += 0.5;
    }

    // Boost highly rated venues
    if (ratings?.averageRating) {
      if (ratings.averageRating >= 4.5) {
        boost += 0.3;
      } else if (ratings.averageRating >= 4.0) {
        boost += 0.2;
      } else if (ratings.averageRating >= 3.5) {
        boost += 0.1;
      }
    }

    // Boost venues with many reviews
    if (ratings?.totalReviews) {
      if (ratings.totalReviews >= 100) {
        boost += 0.3;
      } else if (ratings.totalReviews >= 50) {
        boost += 0.2;
      } else if (ratings.totalReviews >= 20) {
        boost += 0.1;
      }
    }

    // Boost large capacity venues
    if (venue.capacity) {
      if (venue.capacity >= 50000) {
        boost += 0.2;
      } else if (venue.capacity >= 20000) {
        boost += 0.15;
      } else if (venue.capacity >= 10000) {
        boost += 0.1;
      }
    }

    return boost;
  }
}
