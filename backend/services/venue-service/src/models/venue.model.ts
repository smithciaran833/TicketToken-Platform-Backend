import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IVenue {
  id?: string;
  tenant_id: string;
  name: string;
  slug: string;
  description?: string;
  email: string;
  phone?: string;
  website?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state_province: string;
  postal_code?: string;
  country_code: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  venue_type: 'general' | 'stadium' | 'arena' | 'theater' | 'convention_center' |
              'concert_hall' | 'amphitheater' | 'comedy_club' | 'nightclub' | 'bar' |
              'lounge' | 'cabaret' | 'park' | 'festival_grounds' | 'outdoor_venue' |
              'sports_complex' | 'gymnasium' | 'museum' | 'gallery' | 'restaurant' |
              'hotel' | 'other';
  max_capacity: number;
  standing_capacity?: number;
  seated_capacity?: number;
  vip_capacity?: number;
  logo_url?: string;
  cover_image_url?: string;
  image_gallery?: string[];
  virtual_tour_url?: string;
  business_name?: string;
  business_registration?: string;
  tax_id?: string;
  business_type?: string;
  wallet_address?: string;
  collection_address?: string;
  royalty_percentage?: number;
  stripe_connect_account_id?: string;
  stripe_connect_status?: string;
  stripe_connect_charges_enabled?: boolean;
  stripe_connect_payouts_enabled?: boolean;
  stripe_connect_details_submitted?: boolean;
  stripe_connect_capabilities?: Record<string, any>;
  stripe_connect_country?: string;
  stripe_connect_onboarded_at?: Date;
  status?: 'pending' | 'active' | 'inactive' | 'suspended';
  is_verified?: boolean;
  verified_at?: Date;
  verification_level?: string;
  features?: string[];
  amenities?: Record<string, any>;
  accessibility_features?: string[];
  age_restriction?: number;
  dress_code?: string;
  prohibited_items?: string[];
  cancellation_policy?: string;
  refund_policy?: string;
  social_media?: Record<string, any>;
  average_rating?: number;
  total_reviews?: number;
  total_events?: number;
  total_tickets_sold?: number;
  metadata?: Record<string, any>;
  tags?: string[];
  created_by?: string;
  updated_by?: string;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
  version?: number;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  type?: string;
  capacity?: number;
  settings?: Record<string, any>;
  onboarding?: Record<string, boolean>;
  onboarding_status?: 'pending' | 'in_progress' | 'completed';
  is_active?: boolean;
}

export class VenueModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }

  /**
   * SECURITY FIX: Find venue by ID with required tenant validation
   * This is the primary method that should be used for tenant-scoped lookups
   */
  async findByIdWithTenant(id: string, tenantId: string): Promise<IVenue | null> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    const venue = await this.db('venues')
      .where({ id, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async findBySlug(slug: string, tenantId: string): Promise<IVenue | null> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    const venue = await this.db('venues')
      .where({ slug, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  /**
   * DEPRECATED: Use findByIdWithTenant for tenant-scoped lookups
   * This method is kept for backward compatibility but should be avoided
   * It relies on RLS for tenant isolation which may not always be active
   */
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
      status: venueData.status || 'active',
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

  /**
   * SECURITY FIX: Update with tenant validation
   */
  async updateWithTenant(id: string, tenantId: string, data: Partial<IVenue>): Promise<IVenue> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    const dbData = this.transformForDb(data);
    const [record] = await this.db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .whereNull('deleted_at')
      .update({
        ...dbData,
        updated_at: new Date()
      })
      .returning('*');

    if (!record) {
      throw new Error('Venue not found or access denied');
    }

    return this.transformFromDb(record);
  }

  async updateOnboardingStatus(venueId: string, status: 'pending' | 'in_progress' | 'completed'): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const withTrx = this.withTransaction(trx);
      const result = await withTrx.update(venueId, {
        metadata: { onboarding_status: status }
      });
      return !!result;
    });
  }

  canReceivePayments(venue: IVenue): boolean {
    return !!(venue.stripe_connect_charges_enabled && venue.stripe_connect_payouts_enabled);
  }

  async getActiveVenues(tenantId: string, options: any = {}): Promise<IVenue[]> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    const venues = await this.findAll({ tenant_id: tenantId, status: 'active' }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenuesByType(tenantId: string, venueType: IVenue['venue_type'], options: any = {}): Promise<IVenue[]> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    const venues = await this.findAll({ tenant_id: tenantId, venue_type: venueType, status: 'active' }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async searchVenues(tenantId: string, searchTerm: string, options: any = {}): Promise<IVenue[]> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }
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
      .where({ tenant_id: tenantId })
      .whereNull('deleted_at')
      .where('status', 'active');

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

  async getVenueStats(venueId: string, tenantId?: string): Promise<any> {
    let query = this.db('venues').where({ id: venueId });

    if (tenantId) {
      query = query.where({ tenant_id: tenantId });
    }

    const venue = await query.whereNull('deleted_at').first();

    if (!venue) return null;

    return {
      venue: this.transformFromDb(venue),
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

  /**
   * SECURITY FIX: Soft delete with tenant validation
   */
  async softDeleteWithTenant(id: string, tenantId: string): Promise<boolean> {
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant context');
    }

    const result = await this.db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    return result > 0;
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
    if (venueData.image_gallery !== undefined) dbData.image_gallery = venueData.image_gallery;
    if (venueData.virtual_tour_url !== undefined) dbData.virtual_tour_url = venueData.virtual_tour_url;

    if (venueData.business_name !== undefined) dbData.business_name = venueData.business_name;
    if (venueData.business_registration !== undefined) dbData.business_registration = venueData.business_registration;
    if (venueData.tax_id !== undefined) dbData.tax_id = venueData.tax_id;
    if (venueData.business_type !== undefined) dbData.business_type = venueData.business_type;

    if (venueData.wallet_address !== undefined) dbData.wallet_address = venueData.wallet_address;
    if (venueData.collection_address !== undefined) dbData.collection_address = venueData.collection_address;
    if (venueData.royalty_percentage !== undefined) dbData.royalty_percentage = venueData.royalty_percentage;

    if (venueData.stripe_connect_account_id !== undefined) dbData.stripe_connect_account_id = venueData.stripe_connect_account_id;
    if (venueData.stripe_connect_status !== undefined) dbData.stripe_connect_status = venueData.stripe_connect_status;
    if (venueData.stripe_connect_charges_enabled !== undefined) dbData.stripe_connect_charges_enabled = venueData.stripe_connect_charges_enabled;
    if (venueData.stripe_connect_payouts_enabled !== undefined) dbData.stripe_connect_payouts_enabled = venueData.stripe_connect_payouts_enabled;
    if (venueData.stripe_connect_details_submitted !== undefined) dbData.stripe_connect_details_submitted = venueData.stripe_connect_details_submitted;
    if (venueData.stripe_connect_capabilities !== undefined) dbData.stripe_connect_capabilities = venueData.stripe_connect_capabilities;
    if (venueData.stripe_connect_country !== undefined) dbData.stripe_connect_country = venueData.stripe_connect_country;
    if (venueData.stripe_connect_onboarded_at !== undefined) dbData.stripe_connect_onboarded_at = venueData.stripe_connect_onboarded_at;

    if (venueData.status !== undefined) dbData.status = venueData.status;
    if (venueData.is_active !== undefined) {
      dbData.status = venueData.is_active ? 'active' : 'inactive';
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

    if (venueData.version !== undefined) dbData.version = venueData.version;

    return dbData;
  }

  private transformFromDb(dbVenue: any): IVenue {
    if (!dbVenue) return dbVenue;

    if (typeof dbVenue.image_gallery === 'string') {
      try {
        dbVenue.image_gallery = JSON.parse(dbVenue.image_gallery);
      } catch (e) {
        console.error('Failed to parse venue image_gallery JSON:', e);
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
      stripe_connect_account_id: dbVenue.stripe_connect_account_id,
      stripe_connect_status: dbVenue.stripe_connect_status,
      stripe_connect_charges_enabled: dbVenue.stripe_connect_charges_enabled,
      stripe_connect_payouts_enabled: dbVenue.stripe_connect_payouts_enabled,
      stripe_connect_details_submitted: dbVenue.stripe_connect_details_submitted,
      stripe_connect_capabilities: dbVenue.stripe_connect_capabilities,
      stripe_connect_country: dbVenue.stripe_connect_country,
      stripe_connect_onboarded_at: dbVenue.stripe_connect_onboarded_at,
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
      version: dbVenue.version || 1,
      address: addressObject,
      type: dbVenue.venue_type,
      capacity: dbVenue.max_capacity,
      is_active: dbVenue.status === 'active',
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