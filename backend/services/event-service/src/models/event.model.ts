import { BaseModel } from './base.model';
import { Knex } from 'knex';

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

  // Blockchain Integration (legacy)
  collection_address?: string;
  mint_authority?: string;
  royalty_percentage?: number;

  // Blockchain Integration (new - Week 3)
  event_pda?: string;
  artist_wallet?: string;
  artist_percentage?: number;
  venue_percentage?: number;
  blockchain_status?: 'pending' | 'synced' | 'failed';

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

  // Legacy/Compatibility Fields
  event_date?: Date;
  doors_open?: Date;
  capacity?: number;
  category?: string;
  image_url?: string;
}

export class EventModel extends BaseModel {
  /**
   * AUDIT FIX (QS8/DB7): Explicit columns for event queries.
   * Prevents over-fetching and ensures consistent data shape.
   */
  protected selectColumns = [
    'id',
    'tenant_id',
    'venue_id',
    'venue_layout_id',
    'name',
    'slug',
    'description',
    'short_description',
    'event_type',
    'primary_category_id',
    'secondary_category_ids',
    'tags',
    'status',
    'visibility',
    'is_featured',
    'priority_score',
    'banner_image_url',
    'thumbnail_image_url',
    'image_gallery',
    'video_url',
    'virtual_event_url',
    'age_restriction',
    'dress_code',
    'special_requirements',
    'accessibility_info',
    'collection_address',
    'mint_authority',
    'royalty_percentage',
    'event_pda',
    'artist_wallet',
    'artist_percentage',
    'venue_percentage',
    'blockchain_status',
    'is_virtual',
    'is_hybrid',
    'streaming_platform',
    'streaming_config',
    'cancellation_policy',
    'refund_policy',
    'cancellation_deadline_hours',
    'meta_title',
    'meta_description',
    'meta_keywords',
    'view_count',
    'interest_count',
    'share_count',
    'external_id',
    'metadata',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
    'deleted_at',
  ];

  constructor(db: Knex | Knex.Transaction) {
    super('events', db);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async findBySlug(slug: string, tenantId: string): Promise<IEvent | null> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findBySlug');
    }

    const event = await this.db('events')
      .where({ slug, tenant_id: tenantId })
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

  /**
   * Create event with defaults, using ON CONFLICT to handle race conditions.
   *
   * AUDIT FIX (DB2): Uses INSERT ... ON CONFLICT to prevent duplicate creation
   * when concurrent requests create events with same slug/tenant combination.
   *
   * @param eventData - Partial event data
   * @returns Created or existing event
   */
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

    // AUDIT FIX (DB2): Use ON CONFLICT to handle race conditions
    // If a concurrent request creates the same slug/tenant/venue, return existing
    const [result] = await this.db.raw(`
      INSERT INTO events (${Object.keys(dbData).join(', ')})
      VALUES (${Object.keys(dbData).map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (venue_id, slug) WHERE deleted_at IS NULL
      DO UPDATE SET updated_at = NOW()
      RETURNING *, (xmax = 0) AS _inserted
    `, Object.values(dbData));

    const record = result.rows?.[0] || result;

    // Log if we hit a conflict
    if (record && record._inserted === false) {
      // Remove the _inserted flag before returning
      delete record._inserted;
      // Note: Conflict occurred, returned existing record
    } else if (record) {
      delete record._inserted;
    }

    return this.transformFromDb(record);
  }

  /**
   * Upsert event with explicit conflict handling.
   *
   * AUDIT FIX (DB2): Explicit upsert method for idempotent operations.
   * Uses ON CONFLICT to either insert new record or update existing.
   *
   * @param eventData - Event data including tenant_id and venue_id
   * @param conflictColumns - Columns to check for conflict (default: slug, venue_id)
   * @param updateColumns - Columns to update on conflict (default: name, description, updated_at)
   * @returns Upserted event and whether it was inserted or updated
   */
  async upsertEvent(
    eventData: Partial<IEvent>,
    conflictColumns: string[] = ['slug', 'venue_id'],
    updateColumns: string[] = ['name', 'description', 'updated_at']
  ): Promise<{ event: IEvent; inserted: boolean }> {
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
      view_count: eventData.view_count ?? 0,
      interest_count: eventData.interest_count ?? 0,
      share_count: eventData.share_count ?? 0,
    });

    // Build UPDATE clause for conflict
    const updateClause = updateColumns
      .filter(col => col in dbData)
      .map(col => `${col} = EXCLUDED.${col}`)
      .join(', ');

    // Build conflict target
    const conflictTarget = conflictColumns.join(', ');

    const [result] = await this.db.raw(`
      INSERT INTO events (${Object.keys(dbData).join(', ')})
      VALUES (${Object.keys(dbData).map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (${conflictTarget}) WHERE deleted_at IS NULL
      DO UPDATE SET ${updateClause || 'updated_at = NOW()'}
      RETURNING *, (xmax = 0) AS _inserted
    `, Object.values(dbData));

    const record = result.rows?.[0] || result;
    const inserted = record._inserted === true;
    delete record._inserted;

    return {
      event: this.transformFromDb(record),
      inserted
    };
  }

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

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async getEventsByVenue(venueId: string, tenantId: string, options: any = {}): Promise<IEvent[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getEventsByVenue');
    }

    const events = await this.findAll({ venue_id: venueId, tenant_id: tenantId }, options);
    return events.map((e: any) => this.transformFromDb(e));
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async getEventsByCategory(categoryId: string, tenantId: string, options: any = {}): Promise<IEvent[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getEventsByCategory');
    }

    const events = await this.findAll({ primary_category_id: categoryId, tenant_id: tenantId }, options);
    return events.map((e: any) => this.transformFromDb(e));
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async getFeaturedEvents(tenantId: string, limit: number = 10): Promise<IEvent[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getFeaturedEvents');
    }

    const events = await this.db('events')
      .where({ is_featured: true, visibility: 'PUBLIC', tenant_id: tenantId })
      .whereNull('deleted_at')
      .whereIn('status', ['PUBLISHED', 'ON_SALE'])
      .orderBy('priority_score', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return events.map((e: any) => this.transformFromDb(e));
  }

  /**
   * Search events with proper tenant isolation.
   *
   * CRITICAL: tenant_id parameter is REQUIRED for security.
   * This provides defense-in-depth alongside RLS policies.
   *
   * @param searchTerm - Search query string
   * @param options - Search options including tenant_id (REQUIRED), filters, pagination
   * @returns Array of matching events
   * @throws Error if tenant_id is not provided
   */
  async searchEvents(searchTerm: string, options: any = {}): Promise<IEvent[]> {
    const {
      tenant_id,
      limit = 20,
      offset = 0,
      category_id,
      venue_id,
      status,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = options;

    // CRITICAL: tenant_id is REQUIRED - reject if not provided
    if (!tenant_id) {
      throw new Error('tenant_id is required for searchEvents');
    }

    let query = this.db('events')
      .whereNull('deleted_at')
      .where('visibility', 'PUBLIC')
      .where('tenant_id', tenant_id);

    if (searchTerm) {
      // Sanitize search term to prevent SQL injection via LIKE patterns
      const sanitizedSearch = searchTerm.replace(/[%_\\]/g, '\\$&');
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${sanitizedSearch}%`)
          .orWhere('description', 'ilike', `%${sanitizedSearch}%`)
          .orWhere('short_description', 'ilike', `%${sanitizedSearch}%`);
      });
    }

    if (category_id) query = query.where('primary_category_id', category_id);
    if (venue_id) query = query.where('venue_id', venue_id);
    if (status) query = query.where('status', status);

    // Whitelist allowed sort columns to prevent injection
    const allowedSortColumns: Record<string, string> = {
      'name': 'name',
      'priority': 'priority_score',
      'views': 'view_count',
      'created_at': 'created_at',
      'updated_at': 'updated_at'
    };
    const sortColumn = allowedSortColumns[sort_by] || 'created_at';
    const sortDirection = sort_order === 'asc' ? 'asc' : 'desc';

    query = query.orderBy(sortColumn, sortDirection);

    // Enforce max limit to prevent resource exhaustion
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const safeOffset = Math.max(0, parseInt(offset) || 0);

    const events = await query.limit(safeLimit).offset(safeOffset);
    return events.map((e: any) => this.transformFromDb(e));
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id validation for security
   */
  async incrementViewCount(eventId: string, tenantId: string): Promise<void> {
    if (!tenantId) {
      throw new Error('tenant_id is required for incrementViewCount');
    }

    await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .increment('view_count', 1);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id validation for security
   */
  async incrementInterestCount(eventId: string, tenantId: string): Promise<void> {
    if (!tenantId) {
      throw new Error('tenant_id is required for incrementInterestCount');
    }

    await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .increment('interest_count', 1);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id validation for security
   */
  async incrementShareCount(eventId: string, tenantId: string): Promise<void> {
    if (!tenantId) {
      throw new Error('tenant_id is required for incrementShareCount');
    }

    await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .increment('share_count', 1);
  }

  private transformForDb(eventData: Partial<IEvent>): any {
    const dbData: any = {};

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

    // New blockchain fields
    if (eventData.event_pda !== undefined) dbData.event_pda = eventData.event_pda;
    if (eventData.artist_wallet !== undefined) dbData.artist_wallet = eventData.artist_wallet;
    if (eventData.artist_percentage !== undefined) dbData.artist_percentage = eventData.artist_percentage;
    if (eventData.venue_percentage !== undefined) dbData.venue_percentage = eventData.venue_percentage;
    if (eventData.blockchain_status !== undefined) dbData.blockchain_status = eventData.blockchain_status;

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

    if (eventData.category !== undefined) dbData.primary_category_id = eventData.category;

    return dbData;
  }

  private transformFromDb(dbEvent: any): IEvent {
    if (!dbEvent) return dbEvent;

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
      // New blockchain fields
      event_pda: dbEvent.event_pda,
      artist_wallet: dbEvent.artist_wallet,
      artist_percentage: dbEvent.artist_percentage ? parseFloat(dbEvent.artist_percentage) : undefined,
      venue_percentage: dbEvent.venue_percentage ? parseFloat(dbEvent.venue_percentage) : undefined,
      blockchain_status: dbEvent.blockchain_status,
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
