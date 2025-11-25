import { BaseModel } from './base.model';
import { Knex } from 'knex';

// Complete interface matching database schema (63 fields)
export interface IVenue {
  // Core Identity
  id?: string;
  tenant_id: string;
  name: string;
  slug: string;
  description?: string;

  // Contact Information
  email: string;
  phone?: string;
  website?: string;

  // Address - Flat columns for database querying
  address_line1: string;
  address_line2?: string;
  city: string;
  state_province: string;
  postal_code?: string;
  country_code: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;

  // Venue Classification
  venue_type: 'general' | 'stadium' | 'arena' | 'theater' | 'convention_center' |
              'concert_hall' | 'amphitheater' | 'comedy_club' | 'nightclub' | 'bar' |
              'lounge' | 'cabaret' | 'park' | 'festival_grounds' | 'outdoor_venue' |
              'sports_complex' | 'gymnasium' | 'museum' | 'gallery' | 'restaurant' |
              'hotel' | 'other';

  // Capacity
  max_capacity: number;
  standing_capacity?: number;
  seated_capacity?: number;
  vip_capacity?: number;

  // Media
  logo_url?: string;
  cover_image_url?: string;
  image_gallery?: string[];
  virtual_tour_url?: string;

  // Business Information
  business_name?: string;
  business_registration?: string;
  tax_id?: string;
  business_type?: string;

  // Blockchain
  wallet_address?: string;
  collection_address?: string;
  royalty_percentage?: number;

  // Status & Verification
  status?: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CLOSED';
  is_verified?: boolean;
  verified_at?: Date;
  verification_level?: string;

  // Features & Amenities
  features?: string[];
  amenities?: Record<string, any>;
  accessibility_features?: string[];

  // Policies
  age_restriction?: number;
  dress_code?: string;
  prohibited_items?: string[];
  cancellation_policy?: string;
  refund_policy?: string;

  // Social & Ratings
  social_media?: Record<string, any>;
  average_rating?: number;
  total_reviews?: number;
  total_events?: number;
  total_tickets_sold?: number;

  // Metadata
  metadata?: Record<string, any>;
  tags?: string[];

  // Audit Trail
  created_by?: string;
  updated_by?: string;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;

  // Legacy/Compatibility Fields (for backward compatibility with old API)
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  type?: string; // Maps to venue_type
  capacity?: number; // Maps to max_capacity
  settings?: Record<string, any>;
  onboarding?: Record<string, boolean>;
  onboarding_status?: 'pending' | 'in_progress' | 'completed';
  is_active?: boolean;
}

export class VenueModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }

  async findBySlug(slug: string): Promise<IVenue | null> {
    const venue = await this.db('venues')
      .where({ slug })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await super.findById(id);
    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async createWithDefaults(venueData: Partial<IVenue>): Promise<IVenue> {
    const slug = venueData.slug || this.generateSlug(venueData.name || '');

    const dbData = this.transformForDb({
      ...venueData,
      slug,
      timezone: venueData.timezone || 'UTC',
      status: venueData.status || 'ACTIVE',
      is_verified: venueData.is_verified || false,
      average_rating: 0.00,
      total_reviews: 0,
      total_events: 0,
      total_tickets_sold: 0,
      royalty_percentage: venueData.royalty_percentage || 2.50,
      age_restriction: venueData.age_restriction || 0,
    });

    const created = await this.create(dbData);
    return this.transformFromDb(created);
  }

  // Override update to use transformation
  async update(id: string, data: Partial<IVenue>): Promise<IVenue> {
    const dbData = this.transformForDb(data);
    const [record] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...dbData,
        updated_at: new Date()
      })
      .returning('*');

    return this.transformFromDb(record);
  }

  async updateOnboardingStatus(venueId: string, status: 'pending' | 'in_progress' | 'completed'): Promise<boolean> {
    const result = await this.update(venueId, {
      metadata: { onboarding_status: status }
    });
    return !!result;
  }

  async getActiveVenues(options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ status: 'ACTIVE' }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenuesByType(venueType: IVenue['venue_type'], options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ venue_type: venueType, status: 'ACTIVE' }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async searchVenues(searchTerm: string, options: any = {}): Promise<IVenue[]> {
    const {
      limit = 20,
      offset = 0,
      type,
      city,
      state,
      sort_by = 'name',
      sort_order = 'asc'
    } = options;

    let query = this.db('venues')
      .whereNull('deleted_at')
      .where('status', 'ACTIVE');

    if (searchTerm) {
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('city', 'ilike', `%${searchTerm}%`)
          .orWhere('description', 'ilike', `%${searchTerm}%`);
      });
    }

    if (type) {
      query = query.where('venue_type', type);
    }

    if (city) {
      query = query.where('city', 'ilike', city);
    }

    if (state) {
      query = query.where('state_province', 'ilike', state);
    }

    const sortColumn = sort_by === 'created_at' ? 'created_at' :
                      sort_by === 'capacity' ? 'max_capacity' :
                      sort_by === 'rating' ? 'average_rating' : 'name';
    query = query.orderBy(sortColumn, sort_order);

    const venues = await query.limit(limit).offset(offset);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenueStats(venueId: string): Promise<any> {
    const venue = await this.findById(venueId);
    if (!venue) return null;

    return {
      venue,
      stats: {
        totalEvents: venue.total_events || 0,
        totalTicketsSold: venue.total_tickets_sold || 0,
        totalRevenue: 0,
        activeStaff: 0,
        averageRating: venue.average_rating || 0,
        totalReviews: venue.total_reviews || 0,
      },
    };
  }

  private transformForDb(venueData: Partial<IVenue>): any {
    const dbData: any = {};

    if (venueData.id !== undefined) dbData.id = venueData.id;
    if (venueData.tenant_id !== undefined) dbData.tenant_id = venueData.tenant_id;
    if (venueData.name !== undefined) dbData.name = venueData.name;
    if (venueData.slug !== undefined) dbData.slug = venueData.slug;
    if (venueData.description !== undefined) dbData.description = venueData.description;

    if (venueData.email !== undefined) dbData.email = venueData.email;
    if (venueData.phone !== undefined) dbData.phone = venueData.phone;
    if (venueData.website !== undefined) dbData.website = venueData.website;

    if (venueData.address) {
      dbData.address_line1 = venueData.address.street;
      dbData.city = venueData.address.city;
      dbData.state_province = venueData.address.state;
      dbData.postal_code = venueData.address.zipCode;
      dbData.country_code = venueData.address.country || 'US';
    } else {
      if (venueData.address_line1 !== undefined) dbData.address_line1 = venueData.address_line1;
      if (venueData.address_line2 !== undefined) dbData.address_line2 = venueData.address_line2;
      if (venueData.city !== undefined) dbData.city = venueData.city;
      if (venueData.state_province !== undefined) dbData.state_province = venueData.state_province;
      if (venueData.postal_code !== undefined) dbData.postal_code = venueData.postal_code;
      if (venueData.country_code !== undefined) dbData.country_code = venueData.country_code;
    }

    if (venueData.latitude !== undefined) dbData.latitude = venueData.latitude;
    if (venueData.longitude !== undefined) dbData.longitude = venueData.longitude;
    if (venueData.timezone !== undefined) dbData.timezone = venueData.timezone;

    if (venueData.type !== undefined) dbData.venue_type = venueData.type;
    if (venueData.venue_type !== undefined) dbData.venue_type = venueData.venue_type;

    if (venueData.capacity !== undefined) dbData.max_capacity = venueData.capacity;
    if (venueData.max_capacity !== undefined) dbData.max_capacity = venueData.max_capacity;
    if (venueData.standing_capacity !== undefined) dbData.standing_capacity = venueData.standing_capacity;
    if (venueData.seated_capacity !== undefined) dbData.seated_capacity = venueData.seated_capacity;
    if (venueData.vip_capacity !== undefined) dbData.vip_capacity = venueData.vip_capacity;

    if (venueData.logo_url !== undefined) dbData.logo_url = venueData.logo_url;
    if (venueData.cover_image_url !== undefined) dbData.cover_image_url = venueData.cover_image_url;
    if (venueData.image_gallery !== undefined) dbData.image_gallery = JSON.stringify(venueData.image_gallery);
    if (venueData.virtual_tour_url !== undefined) dbData.virtual_tour_url = venueData.virtual_tour_url;

    if (venueData.business_name !== undefined) dbData.business_name = venueData.business_name;
    if (venueData.business_registration !== undefined) dbData.business_registration = venueData.business_registration;
    if (venueData.tax_id !== undefined) dbData.tax_id = venueData.tax_id;
    if (venueData.business_type !== undefined) dbData.business_type = venueData.business_type;

    if (venueData.wallet_address !== undefined) dbData.wallet_address = venueData.wallet_address;
    if (venueData.collection_address !== undefined) dbData.collection_address = venueData.collection_address;
    if (venueData.royalty_percentage !== undefined) dbData.royalty_percentage = venueData.royalty_percentage;

    if (venueData.status !== undefined) dbData.status = venueData.status;
    if (venueData.is_active !== undefined) {
      dbData.status = venueData.is_active ? 'ACTIVE' : 'INACTIVE';
    }
    if (venueData.is_verified !== undefined) dbData.is_verified = venueData.is_verified;
    if (venueData.verified_at !== undefined) dbData.verified_at = venueData.verified_at;
    if (venueData.verification_level !== undefined) dbData.verification_level = venueData.verification_level;

    if (venueData.features !== undefined) dbData.features = venueData.features;
    if (venueData.amenities !== undefined) dbData.amenities = venueData.amenities;
    if (venueData.accessibility_features !== undefined) dbData.accessibility_features = venueData.accessibility_features;

    if (venueData.age_restriction !== undefined) dbData.age_restriction = venueData.age_restriction;
    if (venueData.dress_code !== undefined) dbData.dress_code = venueData.dress_code;
    if (venueData.prohibited_items !== undefined) dbData.prohibited_items = venueData.prohibited_items;
    if (venueData.cancellation_policy !== undefined) dbData.cancellation_policy = venueData.cancellation_policy;
    if (venueData.refund_policy !== undefined) dbData.refund_policy = venueData.refund_policy;

    if (venueData.social_media !== undefined) dbData.social_media = venueData.social_media;
    if (venueData.average_rating !== undefined) dbData.average_rating = venueData.average_rating;
    if (venueData.total_reviews !== undefined) dbData.total_reviews = venueData.total_reviews;
    if (venueData.total_events !== undefined) dbData.total_events = venueData.total_events;
    if (venueData.total_tickets_sold !== undefined) dbData.total_tickets_sold = venueData.total_tickets_sold;

    if (venueData.metadata !== undefined) dbData.metadata = venueData.metadata;
    if (venueData.tags !== undefined) dbData.tags = venueData.tags;

    if (venueData.created_by !== undefined) dbData.created_by = venueData.created_by;
    if (venueData.updated_by !== undefined) dbData.updated_by = venueData.updated_by;

    return dbData;
  }

  private transformFromDb(dbVenue: any): IVenue {
    if (!dbVenue) return dbVenue;

    if (typeof dbVenue.image_gallery === 'string') {
      try {
        dbVenue.image_gallery = JSON.parse(dbVenue.image_gallery);
      } catch (e) {
        dbVenue.image_gallery = [];
      }
    }

    const addressObject = {
      street: dbVenue.address_line1 || '',
      city: dbVenue.city || '',
      state: dbVenue.state_province || '',
      zipCode: dbVenue.postal_code || '',
      country: dbVenue.country_code || 'US',
    };

    return {
      id: dbVenue.id,
      tenant_id: dbVenue.tenant_id,
      name: dbVenue.name,
      slug: dbVenue.slug,
      description: dbVenue.description,
      email: dbVenue.email,
      phone: dbVenue.phone,
      website: dbVenue.website,
      address_line1: dbVenue.address_line1,
      address_line2: dbVenue.address_line2,
      city: dbVenue.city,
      state_province: dbVenue.state_province,
      postal_code: dbVenue.postal_code,
      country_code: dbVenue.country_code,
      latitude: dbVenue.latitude ? parseFloat(dbVenue.latitude) : undefined,
      longitude: dbVenue.longitude ? parseFloat(dbVenue.longitude) : undefined,
      timezone: dbVenue.timezone,
      venue_type: dbVenue.venue_type,
      max_capacity: dbVenue.max_capacity,
      standing_capacity: dbVenue.standing_capacity,
      seated_capacity: dbVenue.seated_capacity,
      vip_capacity: dbVenue.vip_capacity,
      logo_url: dbVenue.logo_url,
      cover_image_url: dbVenue.cover_image_url,
      image_gallery: dbVenue.image_gallery,
      virtual_tour_url: dbVenue.virtual_tour_url,
      business_name: dbVenue.business_name,
      business_registration: dbVenue.business_registration,
      tax_id: dbVenue.tax_id,
      business_type: dbVenue.business_type,
      wallet_address: dbVenue.wallet_address,
      collection_address: dbVenue.collection_address,
      royalty_percentage: dbVenue.royalty_percentage ? parseFloat(dbVenue.royalty_percentage) : undefined,
      status: dbVenue.status,
      is_verified: dbVenue.is_verified,
      verified_at: dbVenue.verified_at,
      verification_level: dbVenue.verification_level,
      features: dbVenue.features,
      amenities: dbVenue.amenities,
      accessibility_features: dbVenue.accessibility_features,
      age_restriction: dbVenue.age_restriction,
      dress_code: dbVenue.dress_code,
      prohibited_items: dbVenue.prohibited_items,
      cancellation_policy: dbVenue.cancellation_policy,
      refund_policy: dbVenue.refund_policy,
      social_media: dbVenue.social_media,
      average_rating: dbVenue.average_rating ? parseFloat(dbVenue.average_rating) : undefined,
      total_reviews: dbVenue.total_reviews,
      total_events: dbVenue.total_events,
      total_tickets_sold: dbVenue.total_tickets_sold,
      metadata: dbVenue.metadata,
      tags: dbVenue.tags,
      created_by: dbVenue.created_by,
      updated_by: dbVenue.updated_by,
      created_at: dbVenue.created_at,
      updated_at: dbVenue.updated_at,
      deleted_at: dbVenue.deleted_at,
      address: addressObject,
      type: dbVenue.venue_type,
      capacity: dbVenue.max_capacity,
      is_active: dbVenue.status === 'ACTIVE',
      onboarding_status: (dbVenue.metadata?.onboarding_status || 'pending') as 'pending' | 'in_progress' | 'completed',
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
