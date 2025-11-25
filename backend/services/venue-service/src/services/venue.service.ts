import { createSpan } from '../utils/tracing';
import { VenueModel, IVenue } from '../models/venue.model';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { StaffModel } from '../models/staff.model';
import { SettingsModel } from '../models/settings.model';
import { VenueAuditLogger } from '../utils/venue-audit-logger';
import { ForbiddenError } from '../utils/errors';
import { Redis } from 'ioredis';
import { Knex } from 'knex';

import { EventPublisher } from './eventPublisher';
import { CacheService } from './cache.service';

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

  // Helper method to get models with proper db connection
  private getModels(dbOrTrx: Knex | Knex.Transaction = this.db) {
    return {
      venueModel: new VenueModel(dbOrTrx),
      staffModel: new StaffModel(dbOrTrx),
      settingsModel: new SettingsModel(dbOrTrx)
    };
  }

  async createVenue(venueData: Partial<IVenue>, ownerId: string, tenantId: string, requestInfo?: any): Promise<IVenue> {
    try {
      // Start transaction
      const venue = await this.db.transaction(async (trx) => {
        // Get models with transaction
        const { venueModel, staffModel } = this.getModels(trx);

        // Create venue using transaction
        // Add owner ID to venue data
        venueData.created_by = ownerId;
        venueData.tenant_id = tenantId;

        const newVenue = await venueModel.createWithDefaults(venueData);

        // Add owner as staff using transaction
        await staffModel.addStaffMember({
          venue_id: newVenue.id,
          user_id: ownerId,
          role: 'owner',
          permissions: ['*'],
        });

        // Initialize default settings in venue_settings table
        await trx('venue_settings').insert({
          venue_id: newVenue.id,
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

      // Log venue creation (outside transaction)
      await this.auditLogger.log('venue_created', ownerId, venue.id!, requestInfo);

      this.logger.info({ venueId: venue.id, ownerId }, 'Venue created successfully');

      // Publish venue created event with error handling
      if (venue.id) {
        try {
          await this.eventPublisher.publishVenueCreated(venue.id, venue, ownerId);
          this.logger.debug('Venue created event published successfully', { venueId: venue.id });
        } catch (publishError) {
          // Log error but don't fail the entire operation
          this.logger.error('Failed to publish venue created event', {
            error: publishError,
            venueId: venue.id,
            ownerId,
            errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error'
          });
          // TODO: Consider queuing to dead letter queue for retry
        }
      }

      return venue;
    } catch (error) {
      this.logger.error({ error, venueData }, 'Failed to create venue');
      throw error;
    }
  }

  async getVenue(venueId: string, userId: string): Promise<IVenue | null> {
    // Check cache first
    const cacheKey = `venue:${venueId}:details`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      // Still need to check access for cached venues
      const hasAccess = await this.checkVenueAccess(venueId, userId);
      if (!hasAccess) {
        throw new Error('Access denied');
      }
      return JSON.parse(cached);
    }

    // Get venue from database
    const { venueModel } = this.getModels();
    const venue = await venueModel.findById(venueId);

    // Return null if venue doesn't exist (controller will return 404)
    if (!venue) {
      return null;
    }

    // NOW check access permission for existing venue
    const hasAccess = await this.checkVenueAccess(venueId, userId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // Cache the venue since it exists and user has access
    await this.redis.setex(cacheKey, 300, JSON.stringify(venue));

    return venue;
  }

  async updateVenue(venueId: string, updates: Partial<IVenue>, userId: string, tenantId?: string): Promise<IVenue> {
    const { venueModel, staffModel } = this.getModels();

    // Check permission
    const hasPermission = await staffModel.hasPermission(venueId, userId, 'venue:update');
    if (!hasPermission) {
      throw new Error('Permission denied');
    }

    // Check if slug is being updated and is unique
    if (updates.slug) {
      const existing = await venueModel.findBySlug(updates.slug);
      if (existing && existing.id !== venueId) {
        throw new Error('Slug already in use');
      }
    }

    const updated = await venueModel.update(venueId, updates);

    // Clear cache
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId, updates }, 'Venue updated');

    // Publish venue updated event with error handling
    if (updated.id) {
      try {
        await this.eventPublisher.publishVenueUpdated(updated.id, updates, userId);
        this.logger.debug('Venue updated event published successfully', { venueId: updated.id });
      } catch (publishError) {
        // Log error but don't fail the entire operation
        this.logger.error('Failed to publish venue updated event', {
          error: publishError,
          venueId: updated.id,
          userId,
          errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error'
        });
        // TODO: Consider queuing to dead letter queue for retry
      }
    }
    return updated;
  }

  async deleteVenue(venueId: string, userId: string): Promise<void> {
    const { venueModel, staffModel } = this.getModels();

    // Only owners can delete venues
    const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staffMember || staffMember.role !== 'owner') {
      throw new Error('Only venue owners can delete venues');
    }

    // Check if venue can be deleted (no active events, etc.)
    const canDelete = await this.canDeleteVenue(venueId);
    if (!canDelete.allowed) {
      throw new Error(`Cannot delete venue: ${canDelete.reason}`);
    }

    await venueModel.softDelete(venueId);

    // Clear all caches
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId }, 'Venue deleted');

    // Publish venue deleted event with error handling
    try {
      await this.eventPublisher.publishVenueDeleted(venueId, userId);
      this.logger.debug('Venue deleted event published successfully', { venueId });
    } catch (publishError) {
      // Log error but don't fail the entire operation
      this.logger.error('Failed to publish venue deleted event', {
        error: publishError,
        venueId,
        userId,
        errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error'
      });
      // TODO: Consider queuing to dead letter queue for retry
    }
  }

  async searchVenues(searchTerm: string, filters: any = {}): Promise<IVenue[]> {
    const { venueModel } = this.getModels();
    return venueModel.searchVenues(searchTerm, filters);
  }

  async getVenueStats(venueId: string): Promise<any> {
    const cacheKey = `venue:${venueId}:stats`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { venueModel } = this.getModels();
    const stats = await venueModel.getVenueStats(venueId);

    // Cache for 1 minute
    await this.redis.setex(cacheKey, 60, JSON.stringify(stats));

    return stats;
  }

  async checkVenueAccess(venueId: string, userId: string): Promise<boolean> {
    try {
      const { venueModel, staffModel } = this.getModels();
      this.logger.debug('Checking venue access', { venueId, userId });

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

      const venue = await venueModel.findById(venueId);
      this.logger.debug('Venue lookup result', { 
        venueId, 
        venueExists: !!venue,
        venueStatus: venue?.status 
      });

      if (!venue || venue.status !== 'ACTIVE') {
        this.logger.debug('Access denied: venue not found or inactive', { 
          venueId, 
          venueExists: !!venue,
          status: venue?.status 
        });
        return false;
      }

      this.logger.debug('Access granted', { venueId, userId });
      return true;
    } catch (error) {
      this.logger.error('Error checking venue access', { 
        error, 
        venueId, 
        userId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async updateOnboardingProgress(venueId: string, step: string, completed: boolean): Promise<void> {
    const { venueModel } = this.getModels();

    const venue = await venueModel.findById(venueId);
    if (!venue) {
      throw new Error('Venue not found');
    }

    const onboarding = venue.onboarding || {};
    onboarding[step] = completed;

    await venueModel.update(venueId, {
      onboarding,
      onboarding_status: this.calculateOnboardingStatus(onboarding),
    });

    await this.clearVenueCache(venueId);
  }

  async listVenues(query: any = {}): Promise<IVenue[]> {
    try {
      const searchTerm = query.search || '';
      const filters = {
        type: query.type,
        city: query.city,
        state: query.state,
        limit: query.limit || 20,
        offset: query.offset || 0
      };

      Object.keys(filters).forEach(key =>
        (filters as any)[key] === undefined && delete (filters as any)[key]
      );

      return await this.searchVenues(searchTerm, filters);
    } catch (error) {
      this.logger.error({ error, query }, 'Error listing venues');
      throw error;
    }
  }

  async listUserVenues(userId: string, query: any = {}): Promise<IVenue[]> {
    try {
      const staffVenues = await this.db('venue_staff')
        .where({ user_id: userId, is_active: true })
        .select('venue_id');

      const venueIds = staffVenues.map(s => s.venue_id);

      if (venueIds.length === 0) {
        return [];
      }

      let venueQuery = this.db('venues')
        .whereIn('id', venueIds)
        .whereNull('deleted_at')
        .where('status', 'ACTIVE');

      if (query.type) {
        venueQuery = venueQuery.where('venue_type', query.type);
      }
      if (query.search) {
        venueQuery = venueQuery.where(function() {
          this.where('name', 'ilike', `%${query.search}%`)
            .orWhere('slug', 'ilike', `%${query.search}%`);
        });
      }

      const limit = parseInt(query.limit) || 20;
      const offset = parseInt(query.offset) || 0;
      venueQuery = venueQuery.limit(limit).offset(offset);

      const venues = await venueQuery;

      // Transform venues to include computed fields like is_active
      return venues.map((v: any) => ({
        ...v,
        is_active: v.status === 'ACTIVE',
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
      this.logger.error({ error, userId, query }, 'Failed to list user venues');
      throw error;
    }
  }

  async getAccessDetails(venueId: string, userId: string): Promise<any> {
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

  async addStaffMember(venueId: string, staffData: any, requesterId: string): Promise<any> {
    const { staffModel } = this.getModels();

    // Verify requester has permission to add staff
    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || (requesterStaff.role !== 'owner' && requesterStaff.role !== 'manager')) {
      throw new ForbiddenError('Only owners and managers can add staff');
    }

    // Add the new staff member
    return staffModel.addStaffMember({
      venue_id: venueId,
      user_id: staffData.userId,
      role: staffData.role,
      permissions: staffData.permissions || []
    });
  }

  async getVenueStaff(venueId: string, requesterId: string): Promise<any[]> {
    const { staffModel } = this.getModels();

    // Verify requester has access to this venue
    const hasAccess = await this.checkVenueAccess(venueId, requesterId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return staffModel.getVenueStaff(venueId);
  }


  async removeStaffMember(venueId: string, staffId: string, requesterId: string): Promise<void> {
    const { staffModel } = this.getModels();

    // Verify requester is owner
    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || requesterStaff.role !== 'owner') {
      throw new Error('Only owners can remove staff');
    }

    // Cannot remove yourself
    if (staffId === requesterStaff.id) {
      throw new Error('Cannot remove yourself');
    }

    // Remove the staff member
    await staffModel.delete(staffId);
  }

  private async canDeleteVenue(venueId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // Check for active or future events
      const activeEvents = await this.db('events')
        .where('venue_id', venueId)
        .where('event_date', '>=', new Date())
        .whereNull('deleted_at')
        .count('* as count')
        .first();

      if (activeEvents && parseInt(activeEvents.count as string) > 0) {
        this.logger.warn('Cannot delete venue: has upcoming events', { 
          venueId, 
          eventCount: activeEvents.count 
        });
        return {
          allowed: false,
          reason: 'Venue has upcoming events. Please cancel or reschedule all events before deleting the venue.'
        };
      }

      // Check for pending or confirmed orders for events at this venue
      const activeOrders = await this.db('orders')
        .join('events', 'orders.event_id', 'events.id')
        .where('events.venue_id', venueId)
        .whereIn('orders.status', ['pending', 'confirmed', 'paid'])
        .whereNull('orders.deleted_at')
        .count('* as count')
        .first();

      if (activeOrders && parseInt(activeOrders.count as string) > 0) {
        this.logger.warn('Cannot delete venue: has active orders', { 
          venueId, 
          orderCount: activeOrders.count 
        });
        return {
          allowed: false,
          reason: 'Venue has active ticket orders. Please process or cancel all pending orders before deletion.'
        };
      }

      // Check for events in the past 90 days (for audit/compliance reasons)
      const recentPastDate = new Date();
      recentPastDate.setDate(recentPastDate.getDate() - 90);
      
      const recentEvents = await this.db('events')
        .where('venue_id', venueId)
        .where('event_date', '>=', recentPastDate)
        .where('event_date', '<', new Date())
        .whereNull('deleted_at')
        .count('* as count')
        .first();

      if (recentEvents && parseInt(recentEvents.count as string) > 0) {
        this.logger.warn('Cannot delete venue: has recent past events', { 
          venueId, 
          eventCount: recentEvents.count 
        });
        return {
          allowed: false,
          reason: 'Venue has events from the past 90 days. Please wait for the retention period to expire or contact support.'
        };
      }

      // All checks passed
      this.logger.info('Venue deletion validation passed', { venueId });
      return { allowed: true };
    } catch (error) {
      this.logger.error('Error validating venue deletion', { error, venueId });
      // Fail safe: deny deletion if we can't verify it's safe
      return {
        allowed: false,
        reason: 'Unable to verify venue can be safely deleted. Please try again or contact support.'
      };
    }
  }

  private async clearVenueCache(venueId: string): Promise<void> {
    const keysToDelete = [
      `venue:${venueId}:details`,
      `venue:${venueId}:stats`,
      `venue:${venueId}:events`,
      `venue:${venueId}:staff`
    ];

    for (const key of keysToDelete) {
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
