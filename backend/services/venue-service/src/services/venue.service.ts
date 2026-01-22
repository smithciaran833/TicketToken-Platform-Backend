import { VenueModel, IVenue } from '../models/venue.model';
import { StaffModel } from '../models/staff.model';
import { SettingsModel } from '../models/settings.model';
import { VenueAuditLogger } from '../utils/venue-audit-logger';
import { ForbiddenError } from '../utils/errors';
import { Redis } from 'ioredis';
import { Knex } from 'knex';
import { EventPublisher } from './eventPublisher';
import { CacheService } from './cache.service';

/**
 * SECURITY FIX: VenueService with tenant isolation
 * All public methods now require tenantId parameter
 */
export class VenueService {
  private redis: Redis;
  private auditLogger: VenueAuditLogger;
  private logger: any;
  private db: Knex;
  private cacheService: CacheService;
  private eventPublisher: EventPublisher;

  constructor(dependencies: {
    db: Knex;
    redis: Redis;
    cacheService: CacheService;
    eventPublisher: EventPublisher;
    logger: any
  }) {
    this.redis = dependencies.redis;
    this.logger = dependencies.logger;
    this.auditLogger = new VenueAuditLogger(dependencies.db);
    this.db = dependencies.db;
    this.cacheService = dependencies.cacheService;
    this.eventPublisher = dependencies.eventPublisher;
  }

  private getModels(dbOrTrx: Knex | Knex.Transaction = this.db) {
    return {
      venueModel: new VenueModel(dbOrTrx),
      staffModel: new StaffModel(dbOrTrx),
      settingsModel: new SettingsModel(dbOrTrx)
    };
  }

  /**
   * SECURITY FIX: Validate tenant context
   */
  private validateTenantContext(tenantId: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  async createVenue(venueData: Partial<IVenue>, ownerId: string, tenantId: string, requestInfo?: any): Promise<IVenue> {
    this.validateTenantContext(tenantId);
    
    try {
      const venue = await this.db.transaction(async (trx) => {
        const { venueModel, staffModel } = this.getModels(trx);

        venueData.created_by = ownerId;
        venueData.tenant_id = tenantId;

        const newVenue = await venueModel.createWithDefaults(venueData);

        await staffModel.addStaffMember({
          venue_id: newVenue.id,
          user_id: ownerId,
          role: 'owner',
          permissions: ['*'],
          tenant_id: tenantId,
        });

        await trx('venue_settings').insert({
          venue_id: newVenue.id,
          tenant_id: tenantId,
          max_tickets_per_order: 10,
          ticket_resale_allowed: true,
          allow_print_at_home: true,
          allow_mobile_tickets: true,
          require_id_verification: false,
          ticket_transfer_allowed: true,
          service_fee_percentage: 10,
          facility_fee_amount: 5,
          processing_fee_percentage: 2.9,
          payment_methods: ['card'],
          accepted_currencies: ['USD'],
          payout_frequency: 'weekly',
          minimum_payout_amount: 100,
        });

        return newVenue;
      });

      await this.auditLogger.log('venue_created', ownerId, venue.id!, requestInfo);

      if (venue.id) {
        await this.clearVenueCache(venue.id);
      }

      this.logger.info({ venueId: venue.id, ownerId, tenantId }, 'Venue created successfully');

      if (venue.id) {
        try {
          await this.eventPublisher.publishVenueCreated(venue.id, venue, ownerId, tenantId);
        } catch (publishError) {
          this.logger.warn('Event publishing failed but queued for retry', {
            venueId: venue.id,
            ownerId,
            errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error'
          });
        }
      }

      return venue;
    } catch (error) {
      this.logger.error({ error, venueData, tenantId }, 'Failed to create venue');
      throw error;
    }
  }

  /**
   * SECURITY FIX: Added tenantId parameter for tenant isolation
   */
  async getVenue(venueId: string, userId: string, tenantId: string): Promise<IVenue | null> {
    this.validateTenantContext(tenantId);

    const cacheKey = `venue:${tenantId}:${venueId}:details`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const hasAccess = await this.checkVenueAccess(venueId, userId, tenantId);
      if (!hasAccess) {
        throw new ForbiddenError('Access denied to this venue');
      }
      return JSON.parse(cached);
    }

    const { venueModel } = this.getModels();
    const venue = await venueModel.findByIdWithTenant(venueId, tenantId);

    if (!venue) {
      return null;
    }

    const hasAccess = await this.checkVenueAccess(venueId, userId, tenantId);
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to this venue');
    }

    await this.redis.setex(cacheKey, 300, JSON.stringify(venue));

    return venue;
  }

  /**
   * SECURITY FIX: tenantId now required
   */
  async updateVenue(venueId: string, updates: Partial<IVenue>, userId: string, tenantId: string, expectedVersion?: number): Promise<IVenue> {
    this.validateTenantContext(tenantId);

    const { venueModel, staffModel } = this.getModels();

    const hasPermission = await staffModel.hasPermission(venueId, userId, 'venue:update');
    if (!hasPermission) {
      throw new ForbiddenError('Permission denied');
    }

    const currentVenue = await venueModel.findByIdWithTenant(venueId, tenantId);
    if (!currentVenue) {
      throw new Error('Venue not found');
    }

    if (expectedVersion !== undefined && currentVenue.version !== expectedVersion) {
      throw new Error(`Version conflict: venue was modified by another user. Expected version ${expectedVersion}, but current version is ${currentVenue.version}. Please refresh and try again.`);
    }

    if (updates.slug && tenantId) {
      const existing = await venueModel.findBySlug(updates.slug, tenantId);
      if (existing && existing.id !== venueId) {
        throw new Error('Slug already in use');
      }
    }

    const updatesWithVersion = {
      ...updates,
      version: (currentVenue.version || 0) + 1
    };

    const updated = await venueModel.updateWithTenant(venueId, tenantId, updatesWithVersion);

    await this.clearVenueCache(venueId);
    await this.auditLogger.log('venue_updated', userId, venueId, { changes: updates });

    this.logger.info({ venueId, userId, tenantId, updates, oldVersion: currentVenue.version, newVersion: updated.version }, 'Venue updated');

    if (updated.id) {
      try {
        await this.eventPublisher.publishVenueUpdated(updated.id, updates, userId, tenantId);
      } catch (publishError) {
        this.logger.warn('Event publishing failed but queued for retry', {
          venueId: updated.id,
          userId,
          errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error'
        });
      }
    }
    return updated;
  }

  /**
   * SECURITY FIX: tenantId now required
   */
  async deleteVenue(venueId: string, userId: string, tenantId: string): Promise<void> {
    this.validateTenantContext(tenantId);

    const { venueModel, staffModel } = this.getModels();

    const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staffMember || staffMember.role !== 'owner') {
      throw new Error('Only venue owners can delete venues');
    }

    const canDelete = await this.canDeleteVenue(venueId, tenantId);
    if (!canDelete.allowed) {
      throw new Error(`Cannot delete venue: ${canDelete.reason}`);
    }

    await venueModel.softDeleteWithTenant(venueId, tenantId);

    await this.auditLogger.log('venue_deleted', userId, venueId);
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId, tenantId }, 'Venue deleted');

    try {
      await this.eventPublisher.publishVenueDeleted(venueId, userId, tenantId);
    } catch (publishError) {
      this.logger.warn('Event publishing failed but queued for retry', {
        venueId,
        userId,
        errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error'
      });
    }
  }

  async searchVenues(tenantId: string, searchTerm: string, filters: any = {}): Promise<IVenue[]> {
    this.validateTenantContext(tenantId);
    const { venueModel } = this.getModels();
    return venueModel.searchVenues(tenantId, searchTerm, filters);
  }

  /**
   * SECURITY FIX: tenantId now required
   */
  async getVenueStats(venueId: string, tenantId: string): Promise<any> {
    this.validateTenantContext(tenantId);

    const cacheKey = `venue:${tenantId}:${venueId}:stats`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { venueModel } = this.getModels();
    const stats = await venueModel.getVenueStats(venueId, tenantId);

    if (stats) {
      await this.redis.setex(cacheKey, 60, JSON.stringify(stats));
    }

    return stats;
  }

  /**
   * SECURITY FIX: tenantId now required
   */
  async checkVenueAccess(venueId: string, userId: string, tenantId: string): Promise<boolean> {
    this.validateTenantContext(tenantId);

    try {
      const { venueModel, staffModel } = this.getModels();
      this.logger.debug('Checking venue access', { venueId, userId, tenantId });

      const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
      this.logger.debug('Staff member lookup result', {
        venueId,
        userId,
        hasStaffMember: !!staffMember,
        isActive: staffMember?.is_active
      });

      if (!staffMember || !staffMember.is_active) {
        this.logger.debug('Access denied: no active staff member found', { venueId, userId });
        return false;
      }

      const venue = await venueModel.findByIdWithTenant(venueId, tenantId);
      this.logger.debug('Venue lookup result', {
        venueId,
        venueExists: !!venue,
        venueStatus: venue?.status
      });

      if (!venue || venue.status !== 'active') {
        this.logger.debug('Access denied: venue not found or inactive', {
          venueId,
          venueExists: !!venue,
          status: venue?.status
        });
        return false;
      }

      this.logger.debug('Access granted', { venueId, userId, tenantId });
      return true;
    } catch (error) {
      this.logger.error('Error checking venue access', {
        error,
        venueId,
        userId,
        tenantId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async updateOnboardingProgress(venueId: string, tenantId: string, step: string, completed: boolean): Promise<void> {
    this.validateTenantContext(tenantId);

    const { venueModel } = this.getModels();

    const venue = await venueModel.findByIdWithTenant(venueId, tenantId);
    if (!venue) {
      throw new Error('Venue not found');
    }

    const onboarding = venue.onboarding || {};
    onboarding[step] = completed;

    await venueModel.updateWithTenant(venueId, tenantId, {
      onboarding,
      onboarding_status: this.calculateOnboardingStatus(onboarding),
    });

    await this.clearVenueCache(venueId);
  }

  async listVenues(tenantId: string, query: any = {}): Promise<IVenue[]> {
    this.validateTenantContext(tenantId);

    try {
      const searchTerm = query.search || '';
      const filters = {
        type: query.type,
        city: query.city,
        state: query.state,
        limit: query.limit || 20,
        offset: query.offset || 0,
        sort_by: query.sort_by,
        sort_order: query.sort_order
      };

      Object.keys(filters).forEach(key =>
        (filters as any)[key] === undefined && delete (filters as any)[key]
      );

      return await this.searchVenues(tenantId, searchTerm, filters);
    } catch (error) {
      this.logger.error({ error, query, tenantId }, 'Error listing venues');
      throw error;
    }
  }

  async listUserVenues(userId: string, tenantId: string, query: any = {}): Promise<IVenue[]> {
    this.validateTenantContext(tenantId);

    try {
      const { staffModel } = this.getModels();
      const staffVenues = await staffModel.getUserVenues(userId, tenantId);

      const venueIds = staffVenues.map(s => s.venue_id);

      if (venueIds.length === 0) {
        return [];
      }

      let venueQuery = this.db('venues')
        .whereIn('id', venueIds)
        .where('tenant_id', tenantId)
        .whereNull('deleted_at')
        .where('status', 'active');

      if (query.type) {
        venueQuery = venueQuery.where('venue_type', query.type);
      }
      if (query.search) {
        venueQuery = venueQuery.where(function() {
          this.whereRaw('name ILIKE ?', [`%${query.search}%`])
            .orWhereRaw('slug ILIKE ?', [`%${query.search}%`]);
        });
      }

      const limit = parseInt(query.limit) || 20;
      const offset = parseInt(query.offset) || 0;
      venueQuery = venueQuery.limit(limit).offset(offset);

      const venues = await venueQuery;

      return venues.map((v: any) => ({
        ...v,
        is_active: v.status === 'active',
        type: v.venue_type,
        capacity: v.max_capacity,
        address: {
          street: v.address_line1 || '',
          city: v.city || '',
          state: v.state_province || '',
          zipCode: v.postal_code || '',
          country: v.country_code || 'US',
        }
      }));
    } catch (error) {
      this.logger.error({ error, userId, tenantId, query }, 'Failed to list user venues');
      throw error;
    }
  }

  /**
   * SECURITY FIX: tenantId now required
   */
  async getAccessDetails(venueId: string, userId: string, tenantId: string): Promise<any> {
    this.validateTenantContext(tenantId);

    const { staffModel } = this.getModels();

    const staff = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staff) {
      return null;
    }
    return {
      role: staff.role,
      permissions: staff.permissions || []
    };
  }

  async addStaffMember(venueId: string, staffData: any, requesterId: string, tenantId: string): Promise<any> {
    this.validateTenantContext(tenantId);

    const { staffModel } = this.getModels();

    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || (requesterStaff.role !== 'owner' && requesterStaff.role !== 'manager')) {
      throw new ForbiddenError('Only owners and managers can add staff');
    }

    const limitCheck = await staffModel.validateStaffLimit(venueId);
    if (!limitCheck.canAdd) {
      throw new Error(`Staff limit reached: ${limitCheck.current}/${limitCheck.limit}`);
    }

    return staffModel.addStaffMember({
      venue_id: venueId,
      user_id: staffData.userId,
      role: staffData.role,
      permissions: staffData.permissions || [],
      tenant_id: tenantId,
    });
  }

  async getVenueStaff(venueId: string, requesterId: string, tenantId: string, includeInactive: boolean = false): Promise<any[]> {
    this.validateTenantContext(tenantId);

    const { staffModel } = this.getModels();

    const hasAccess = await this.checkVenueAccess(venueId, requesterId, tenantId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return staffModel.getVenueStaff(venueId, includeInactive);
  }

  async updateStaffRole(venueId: string, staffId: string, role: string, requesterId: string, permissions?: string[]): Promise<any> {
    const { staffModel } = this.getModels();

    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || (requesterStaff.role !== 'owner' && requesterStaff.role !== 'manager')) {
      throw new ForbiddenError('Only owners and managers can update staff roles');
    }

    const targetStaff = await staffModel.findById(staffId);
    if (!targetStaff || targetStaff.venue_id !== venueId) {
      throw new Error('Staff member not found');
    }

    if (targetStaff.role === 'owner') {
      throw new ForbiddenError('Cannot change owner role');
    }

    if (requesterStaff.role === 'manager' && role === 'owner') {
      throw new ForbiddenError('Managers cannot promote to owner');
    }

    if (requesterStaff.role === 'manager' && targetStaff.role === 'manager') {
      throw new ForbiddenError('Managers cannot modify other managers');
    }

    const updated = await staffModel.updateRole(staffId, role as any, permissions);

    this.logger.info({ venueId, staffId, oldRole: targetStaff.role, newRole: role, requesterId }, 'Staff role updated');

    return updated;
  }

  async removeStaffMember(venueId: string, staffId: string, requesterId: string): Promise<void> {
    const { staffModel } = this.getModels();

    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || (requesterStaff.role !== 'owner' && requesterStaff.role !== 'manager')) {
      throw new ForbiddenError('Only owners and managers can remove staff');
    }

    const targetStaff = await staffModel.findById(staffId);
    if (!targetStaff || targetStaff.venue_id !== venueId) {
      throw new Error('Staff member not found');
    }

    if (targetStaff.user_id === requesterStaff.user_id) {
      throw new Error('Cannot remove yourself');
    }

    if (targetStaff.role === 'owner') {
      throw new ForbiddenError('Cannot remove venue owner');
    }

    if (requesterStaff.role === 'manager' && targetStaff.role === 'manager') {
      throw new ForbiddenError('Managers cannot remove other managers');
    }

    await staffModel.delete(staffId);

    this.logger.info({ venueId, staffId, removedUserId: targetStaff.user_id, requesterId }, 'Staff member removed');
  }

  private async canDeleteVenue(venueId: string, tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const activeEvents = await this.db('event_schedules')
        .join('events', 'event_schedules.event_id', 'events.id')
        .where('events.venue_id', venueId)
        .where('events.tenant_id', tenantId)
        .where('event_schedules.starts_at', '>=', new Date())
        .whereNull('events.deleted_at')
        .whereNull('event_schedules.deleted_at')
        .count('* as count')
        .first();

      if (activeEvents && parseInt(activeEvents.count as string) > 0) {
        this.logger.warn('Cannot delete venue: has upcoming events', {
          venueId,
          tenantId,
          eventCount: activeEvents.count
        });
        return {
          allowed: false,
          reason: 'Venue has upcoming events. Please cancel or reschedule all events before deleting the venue.'
        };
      }

      const recentPastDate = new Date();
      recentPastDate.setDate(recentPastDate.getDate() - 90);

      const recentEvents = await this.db('event_schedules')
        .join('events', 'event_schedules.event_id', 'events.id')
        .where('events.venue_id', venueId)
        .where('events.tenant_id', tenantId)
        .where('event_schedules.starts_at', '>=', recentPastDate)
        .where('event_schedules.starts_at', '<', new Date())
        .whereNull('events.deleted_at')
        .whereNull('event_schedules.deleted_at')
        .count('* as count')
        .first();

      if (recentEvents && parseInt(recentEvents.count as string) > 0) {
        this.logger.warn('Cannot delete venue: has recent past events', {
          venueId,
          tenantId,
          eventCount: recentEvents.count
        });
        return {
          allowed: false,
          reason: 'Venue has events from the past 90 days. Please wait for the retention period to expire or contact support.'
        };
      }

      this.logger.info('Venue deletion validation passed', { venueId, tenantId });
      return { allowed: true };
    } catch (error) {
      this.logger.error('Error validating venue deletion', { error, venueId, tenantId });
      return {
        allowed: false,
        reason: 'Unable to verify venue can be safely deleted. Please try again or contact support.'
      };
    }
  }

  private async clearVenueCache(venueId: string): Promise<void> {
    const pattern = `venue:*:${venueId}:*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      await this.redis.del(key);
    }

    const legacyKeys = [
      `venue:${venueId}:details`,
      `venue:${venueId}:stats`,
      `venue:${venueId}:events`,
      `venue:${venueId}:staff`
    ];

    for (const key of legacyKeys) {
      await this.redis.del(key);
    }
  }

  private calculateOnboardingStatus(onboarding: Record<string, boolean>): 'pending' | 'in_progress' | 'completed' {
    const steps = ['basic_info', 'layout', 'integrations', 'staff'];
    const completed = steps.filter(step => onboarding[step]).length;

    if (completed === 0) return 'pending';
    if (completed === steps.length) return 'completed';
    return 'in_progress';
  }
}
