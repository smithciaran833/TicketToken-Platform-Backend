import { createSpan } from '../utils/tracing';
import { VenueModel, IVenue } from '../models/venue.model';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { StaffModel } from '../models/staff.model';
import { SettingsModel } from '../models/settings.model';
import { VenueAuditLogger } from '../utils/venue-audit-logger';
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

  async createVenue(venueData: Partial<IVenue>, ownerId: string, requestInfo?: any): Promise<IVenue> {
    try {
      // Start transaction
      const venue = await this.db.transaction(async (trx) => {
        // Get models with transaction
        const { venueModel, staffModel } = this.getModels(trx);

        // Create venue using transaction
        // Add owner ID to venue data
        venueData.created_by = ownerId;

        const newVenue = await venueModel.createWithDefaults(venueData);

        // Add owner as staff using transaction
        await staffModel.addStaffMember({
          venue_id: newVenue.id,
          user_id: ownerId,
          role: 'owner',
          permissions: ['*'],
        });

        // Initialize default settings using transaction
        await trx('venues').where({ id: newVenue.id }).update({
          settings: this.getDefaultSettings(),
        });

        return newVenue;
      });

      // Log venue creation (outside transaction)
      await this.auditLogger.log('venue_created', ownerId, venue.id!, requestInfo);

      this.logger.info({ venueId: venue.id, ownerId }, 'Venue created successfully');

      // Publish venue created event
      if (venue.id) {
        await this.eventPublisher.publishVenueCreated(venue.id, venue, ownerId);
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

    // Publish venue updated event
    if (updated.id) {
      await this.eventPublisher.publishVenueUpdated(updated.id, updates, userId);
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

    // Publish venue deleted event
    await this.eventPublisher.publishVenueDeleted(venueId, userId);
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
      console.log("DEBUG: Checking access for", { venueId, userId });

      const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
      console.log("DEBUG: Staff member result:", staffMember);

      if (!staffMember || !staffMember.is_active) {
        console.log("DEBUG: No active staff member found");
        return false;
      }

      const venue = await venueModel.findById(venueId);
      console.log("DEBUG: Venue result:", venue?.id, venue?.is_active);

      if (!venue || !venue.is_active) {
        console.log("DEBUG: Venue not found or inactive");
        return false;
      }

      return true;
    } catch (error) {
      console.error("DEBUG: Error in checkVenueAccess:", error);
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
        .whereNull('deleted_at')
        .select('venue_id');

      const venueIds = staffVenues.map(s => s.venue_id);

      if (venueIds.length === 0) {
        return [];
      }

      let venueQuery = this.db('venues')
        .whereIn('id', venueIds)
        .whereNull('deleted_at')
        .where('is_active', true);

      if (query.type) {
        venueQuery = venueQuery.where('type', query.type);
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
      return venues;
    } catch (error) {
      this.logger.error({ error, userId, query }, 'Error listing user venues');
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
      throw new Error('Only owners and managers can add staff');
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
    return { allowed: true };
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

  private calculateOnboardingStatus(onboarding: Record<string, boolean>): string {
    const steps = ['basic_info', 'layout', 'integrations', 'staff'];
    const completed = steps.filter(step => onboarding[step]).length;

    if (completed === 0) return 'pending';
    if (completed === steps.length) return 'completed';
    return 'in_progress';
  }

  private getDefaultSettings(): Record<string, any> {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
      }
    };
  }
}
