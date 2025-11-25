import { BaseModel } from './base.model';
import { Knex } from 'knex';

// Complete interface matching database schema (50+ fields)
export interface IEvent {
  // Core Identity
  id?: string;
  tenant_id: string;
  venue_id: string;
  venue_layout_id?: string;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;

  // Event Type and Classification
  event_type: 'single' | 'recurring' | 'series';
  primary_category_id?: string;
  secondary_category_ids?: string[];
  tags?: string[];

  // Status and Visibility
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ON_SALE' |
          'SOLD_OUT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  visibility?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  is_featured?: boolean;
  priority_score?: number;

  // Media
  banner_image_url?: string;
  thumbnail_image_url?: string;
  image_gallery?: any[];
  video_url?: string;
  virtual_event_url?: string;

  // Event Details
  age_restriction?: number;
  dress_code?: string;
  special_requirements?: string[];
  accessibility_info?: Record<string, any>;

  // Blockchain Integration
  collection_address?: string;
  mint_authority?: string;
  royalty_percentage?: number;

  // Virtual/Hybrid Event Settings
  is_virtual?: boolean;
  is_hybrid?: boolean;
  streaming_platform?: string;
  streaming_config?: Record<string, any>;

  // Policies
  cancellation_policy?: string;
  refund_policy?: string;
  cancellation_deadline_hours?: number;

  // SEO and Marketing
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string[];

  // Analytics
  view_count?: number;
  interest_count?: number;
  share_count?: number;

  // Metadata
  external_id?: string;
  metadata?: Record<string, any>;

  // Audit Trail
  created_by?: string;
  updated_by?: string;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;

  // Legacy/Compatibility Fields (for backward compatibility)
  event_date?: Date;         // Maps to first schedule's starts_at
  doors_open?: Date;         // Maps to first schedule's doors_open_at
  capacity?: number;         // Maps to total capacity across all sections
  category?: string;         // Maps to primary_category_id
  image_url?: string;        // Maps to banner_image_url
}

export class EventModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('events', db);
  }

  async findBySlug(slug: string): Promise<IEvent | null> {
    const event = await this.db('events')
      .where({ slug })
      .whereNull('deleted_at')
      .first();

    if (event) {
      return this.transformFromDb(event);
    }
    return null;
  }

  async findById(id: string): Promise<IEvent | null> {
    const event = await super.findById(id);
    if (event) {
      return this.transformFromDb(event);
    }
    return null;
  }

  async createWithDefaults(eventData: Partial<IEvent>): Promise<IEvent> {
    const slug = eventData.slug || this.generateSlug(eventData.name || '');

    const dbData = this.transformForDb({
      ...eventData,
      slug,
      event_type: eventData.event_type || 'single',
      status: eventData.status || 'DRAFT',
      visibility: eventData.visibility || 'PUBLIC',
      is_featured: eventData.is_featured || false,
      priority_score: eventData.priority_score || 0,
      age_restriction: eventData.age_restriction || 0,
      is_virtual: eventData.is_virtual || false,
      is_hybrid: eventData.is_hybrid || false,
      cancellation_deadline_hours: eventData.cancellation_deadline_hours || 24,
      view_count: 0,
      interest_count: 0,
      share_count: 0,
    });

    const created = await this.create(dbData);
    return this.transformFromDb(created);
  }

  // Override update to use transformation
  async update(id: string, data: Partial<IEvent>): Promise<IEvent> {
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

  async getEventsByVenue(venueId: string, options: any = {}): Promise<IEvent[]> {
    const events = await this.findAll({ venue_id: venueId }, options);
    return events.map((e: any) => this.transformFromDb(e));
  }

  async getEventsByCategory(categoryId: string, options: any = {}): Promise<IEvent[]> {
    const events = await this.findAll({ primary_category_id: categoryId }, options);
    return events.map((e: any) => this.transformFromDb(e));
  }

  async getFeaturedEvents(limit: number = 10): Promise<IEvent[]> {
    const events = await this.db('events')
      .where({ is_featured: true, visibility: 'PUBLIC' })
      .whereNull('deleted_at')
      .whereIn('status', ['PUBLISHED', 'ON_SALE'])
      .orderBy('priority_score', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return events.map((e: any) => this.transformFromDb(e));
  }

  async searchEvents(searchTerm: string, options: any = {}): Promise<IEvent[]> {
    const {
      limit = 20,
      offset = 0,
      category_id,
      venue_id,
      status,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = options;

    let query = this.db('events')
      .whereNull('deleted_at')
      .where('visibility', 'PUBLIC');

    if (searchTerm) {
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('description', 'ilike', `%${searchTerm}%`)
          .orWhere('short_description', 'ilike', `%${searchTerm}%`);
      });
    }

    if (category_id) {
      query = query.where('primary_category_id', category_id);
    }

    if (venue_id) {
      query = query.where('venue_id', venue_id);
    }

    if (status) {
      query = query.where('status', status);
    }

    const sortColumn = sort_by === 'name' ? 'name' :
                      sort_by === 'priority' ? 'priority_score' :
                      sort_by === 'views' ? 'view_count' : 'created_at';

    query = query.orderBy(sortColumn, sort_order);

    const events = await query.limit(limit).offset(offset);
    return events.map((e: any) => this.transformFromDb(e));
  }

  async incrementViewCount(eventId: string): Promise<void> {
    await this.db('events')
      .where({ id: eventId })
      .increment('view_count', 1);
  }

  async incrementInterestCount(eventId: string): Promise<void> {
    await this.db('events')
      .where({ id: eventId })
      .increment('interest_count', 1);
  }

  async incrementShareCount(eventId: string): Promise<void> {
    await this.db('events')
      .where({ id: eventId })
      .increment('share_count', 1);
  }

  private transformForDb(eventData: Partial<IEvent>): any {
    const dbData: any = {};

    // Map all the fields from IEvent to database columns
    if (eventData.id !== undefined) dbData.id = eventData.id;
    if (eventData.tenant_id !== undefined) dbData.tenant_id = eventData.tenant_id;
    if (eventData.venue_id !== undefined) dbData.venue_id = eventData.venue_id;
    if (eventData.venue_layout_id !== undefined) dbData.venue_layout_id = eventData.venue_layout_id;
    if (eventData.name !== undefined) dbData.name = eventData.name;
    if (eventData.slug !== undefined) dbData.slug = eventData.slug;
    if (eventData.description !== undefined) dbData.description = eventData.description;
    if (eventData.short_description !== undefined) dbData.short_description = eventData.short_description;

    if (eventData.event_type !== undefined) dbData.event_type = eventData.event_type;
    if (eventData.primary_category_id !== undefined) dbData.primary_category_id = eventData.primary_category_id;
    if (eventData.secondary_category_ids !== undefined) dbData.secondary_category_ids = eventData.secondary_category_ids;
    if (eventData.tags !== undefined) dbData.tags = eventData.tags;

    if (eventData.status !== undefined) dbData.status = eventData.status;
    if (eventData.visibility !== undefined) dbData.visibility = eventData.visibility;
    if (eventData.is_featured !== undefined) dbData.is_featured = eventData.is_featured;
    if (eventData.priority_score !== undefined) dbData.priority_score = eventData.priority_score;

    // Handle legacy image_url -> banner_image_url mapping
    if (eventData.image_url !== undefined) dbData.banner_image_url = eventData.image_url;
    if (eventData.banner_image_url !== undefined) dbData.banner_image_url = eventData.banner_image_url;
    if (eventData.thumbnail_image_url !== undefined) dbData.thumbnail_image_url = eventData.thumbnail_image_url;
    if (eventData.image_gallery !== undefined) dbData.image_gallery = JSON.stringify(eventData.image_gallery);
    if (eventData.video_url !== undefined) dbData.video_url = eventData.video_url;
    if (eventData.virtual_event_url !== undefined) dbData.virtual_event_url = eventData.virtual_event_url;

    if (eventData.age_restriction !== undefined) dbData.age_restriction = eventData.age_restriction;
    if (eventData.dress_code !== undefined) dbData.dress_code = eventData.dress_code;
    if (eventData.special_requirements !== undefined) dbData.special_requirements = eventData.special_requirements;
    if (eventData.accessibility_info !== undefined) dbData.accessibility_info = eventData.accessibility_info;

    if (eventData.collection_address !== undefined) dbData.collection_address = eventData.collection_address;
    if (eventData.mint_authority !== undefined) dbData.mint_authority = eventData.mint_authority;
    if (eventData.royalty_percentage !== undefined) dbData.royalty_percentage = eventData.royalty_percentage;

    if (eventData.is_virtual !== undefined) dbData.is_virtual = eventData.is_virtual;
    if (eventData.is_hybrid !== undefined) dbData.is_hybrid = eventData.is_hybrid;
    if (eventData.streaming_platform !== undefined) dbData.streaming_platform = eventData.streaming_platform;
    if (eventData.streaming_config !== undefined) dbData.streaming_config = eventData.streaming_config;

    if (eventData.cancellation_policy !== undefined) dbData.cancellation_policy = eventData.cancellation_policy;
    if (eventData.refund_policy !== undefined) dbData.refund_policy = eventData.refund_policy;
    if (eventData.cancellation_deadline_hours !== undefined) dbData.cancellation_deadline_hours = eventData.cancellation_deadline_hours;

    if (eventData.meta_title !== undefined) dbData.meta_title = eventData.meta_title;
    if (eventData.meta_description !== undefined) dbData.meta_description = eventData.meta_description;
    if (eventData.meta_keywords !== undefined) dbData.meta_keywords = eventData.meta_keywords;

    if (eventData.view_count !== undefined) dbData.view_count = eventData.view_count;
    if (eventData.interest_count !== undefined) dbData.interest_count = eventData.interest_count;
    if (eventData.share_count !== undefined) dbData.share_count = eventData.share_count;

    if (eventData.external_id !== undefined) dbData.external_id = eventData.external_id;
    if (eventData.metadata !== undefined) dbData.metadata = eventData.metadata;

    if (eventData.created_by !== undefined) dbData.created_by = eventData.created_by;
    if (eventData.updated_by !== undefined) dbData.updated_by = eventData.updated_by;

    // Handle legacy category -> primary_category_id mapping
    if (eventData.category !== undefined) dbData.primary_category_id = eventData.category;

    return dbData;
  }

  private transformFromDb(dbEvent: any): IEvent {
    if (!dbEvent) return dbEvent;

    // Parse JSON fields
    if (typeof dbEvent.image_gallery === 'string') {
      try {
        dbEvent.image_gallery = JSON.parse(dbEvent.image_gallery);
      } catch (e) {
        dbEvent.image_gallery = [];
      }
    }

    return {
      tenant_id: dbEvent.tenant_id,
      id: dbEvent.id,
      venue_id: dbEvent.venue_id,
      venue_layout_id: dbEvent.venue_layout_id,
      name: dbEvent.name,
      slug: dbEvent.slug,
      description: dbEvent.description,
      short_description: dbEvent.short_description,
      event_type: dbEvent.event_type,
      primary_category_id: dbEvent.primary_category_id,
      secondary_category_ids: dbEvent.secondary_category_ids,
      tags: dbEvent.tags,
      status: dbEvent.status,
      visibility: dbEvent.visibility,
      is_featured: dbEvent.is_featured,
      priority_score: dbEvent.priority_score,
      banner_image_url: dbEvent.banner_image_url,
      thumbnail_image_url: dbEvent.thumbnail_image_url,
      image_gallery: dbEvent.image_gallery,
      video_url: dbEvent.video_url,
      virtual_event_url: dbEvent.virtual_event_url,
      age_restriction: dbEvent.age_restriction,
      dress_code: dbEvent.dress_code,
      special_requirements: dbEvent.special_requirements,
      accessibility_info: dbEvent.accessibility_info,
      collection_address: dbEvent.collection_address,
      mint_authority: dbEvent.mint_authority,
      royalty_percentage: dbEvent.royalty_percentage ? parseFloat(dbEvent.royalty_percentage) : undefined,
      is_virtual: dbEvent.is_virtual,
      is_hybrid: dbEvent.is_hybrid,
      streaming_platform: dbEvent.streaming_platform,
      streaming_config: dbEvent.streaming_config,
      cancellation_policy: dbEvent.cancellation_policy,
      refund_policy: dbEvent.refund_policy,
      cancellation_deadline_hours: dbEvent.cancellation_deadline_hours,
      meta_title: dbEvent.meta_title,
      meta_description: dbEvent.meta_description,
      meta_keywords: dbEvent.meta_keywords,
      view_count: dbEvent.view_count,
      interest_count: dbEvent.interest_count,
      share_count: dbEvent.share_count,
      external_id: dbEvent.external_id,
      metadata: dbEvent.metadata,
      created_by: dbEvent.created_by,
      updated_by: dbEvent.updated_by,
      created_at: dbEvent.created_at,
      updated_at: dbEvent.updated_at,
      deleted_at: dbEvent.deleted_at,
      // Legacy compatibility fields
      image_url: dbEvent.banner_image_url,
      category: dbEvent.primary_category_id,
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
