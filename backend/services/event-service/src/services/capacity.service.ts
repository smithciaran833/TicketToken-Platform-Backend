import { Knex } from 'knex';
import { EventCapacityModel, IEventCapacity } from '../models';
import { NotFoundError, ValidationError } from '../types';
import { pino } from 'pino';
import { VenueServiceClient } from './venue-service.client';

const logger = pino({ name: 'capacity-service' });

export class CapacityService {
  private capacityModel: EventCapacityModel;

  constructor(
    private db: Knex,
    private venueClient?: VenueServiceClient
  ) {
    this.capacityModel = new EventCapacityModel(db);
  }

  // Helper to parse locked price data decimals
  private parseLockedPriceData(lockedPriceData: any): any {
    if (!lockedPriceData) return null;

    return {
      ...lockedPriceData,
      locked_price: typeof lockedPriceData.locked_price === 'string'
        ? parseFloat(lockedPriceData.locked_price)
        : lockedPriceData.locked_price,
      service_fee: typeof lockedPriceData.service_fee === 'string'
        ? parseFloat(lockedPriceData.service_fee)
        : lockedPriceData.service_fee,
      facility_fee: typeof lockedPriceData.facility_fee === 'string'
        ? parseFloat(lockedPriceData.facility_fee)
        : lockedPriceData.facility_fee,
      tax_rate: typeof lockedPriceData.tax_rate === 'string'
        ? parseFloat(lockedPriceData.tax_rate)
        : lockedPriceData.tax_rate
    };
  }

  async getEventCapacity(eventId: string, tenantId: string): Promise<IEventCapacity[]> {
    const capacity = await this.db('event_capacity')
      .where({ event_id: eventId, tenant_id: tenantId })
      .select('*');

    return capacity;
  }

  async getCapacityById(capacityId: string, tenantId: string): Promise<IEventCapacity> {
    const capacity = await this.db('event_capacity')
      .where({ id: capacityId, tenant_id: tenantId })
      .first();

    if (!capacity) {
      throw new NotFoundError('Capacity section');
    }

    return capacity;
  }

  async createCapacity(data: Partial<IEventCapacity>, tenantId: string, authToken: string): Promise<IEventCapacity> {
    // Validate required fields
    if (!data.section_name || !data.total_capacity) {
      throw new ValidationError([
        { field: 'section_name', message: 'Section name is required' },
        { field: 'total_capacity', message: 'Total capacity is required' }
      ]);
    }

    if (data.total_capacity < 0) {
      throw new ValidationError([
        { field: 'total_capacity', message: 'Capacity cannot be negative' }
      ]);
    }

    // Before creating, validate total won't exceed venue capacity (if venue client available)
    if (data.event_id && this.venueClient) {
      await this.validateVenueCapacity(data.event_id, tenantId, authToken, data.total_capacity);
    }

    const capacityData = {
      ...data,
      tenant_id: tenantId,
      available_capacity: data.total_capacity,
      reserved_capacity: 0,
      sold_count: 0,
      pending_count: 0,
      is_active: data.is_active !== undefined ? data.is_active : true,
      is_visible: data.is_visible !== undefined ? data.is_visible : true,
    };

    const [capacity] = await this.db('event_capacity')
      .insert(capacityData)
      .returning('*');

    logger.info({ capacityId: capacity.id, eventId: data.event_id, tenantId }, 'Capacity created');

    return capacity;
  }

  async updateCapacity(capacityId: string, data: Partial<IEventCapacity>, tenantId: string, authToken?: string): Promise<IEventCapacity> {
    const existing = await this.getCapacityById(capacityId, tenantId);

    // If updating total_capacity, validate against venue
    if (data.total_capacity !== undefined && data.total_capacity !== existing.total_capacity) {
      if (data.total_capacity < 0) {
        throw new ValidationError([
          { field: 'total_capacity', message: 'Capacity cannot be negative' }
        ]);
      }

      // Validate new total won't exceed venue capacity (if venue client available)
      if (authToken && this.venueClient) {
        const capacityDiff = data.total_capacity - existing.total_capacity;
        await this.validateVenueCapacity(existing.event_id, tenantId, authToken, capacityDiff);
      }
    }

    const [updated] = await this.db('event_capacity')
      .where({ id: capacityId, tenant_id: tenantId })
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    logger.info({ capacityId, tenantId }, 'Capacity updated');

    return updated;
  }

  async checkAvailability(capacityId: string, quantity: number, tenantId: string): Promise<boolean> {
    const capacity = await this.getCapacityById(capacityId, tenantId);
    return capacity.available_capacity >= quantity;
  }

  async reserveCapacity(
    capacityId: string,
    quantity: number,
    tenantId: string,
    reservationMinutes: number = 15,
    pricingId?: string,
    authToken?: string
  ): Promise<IEventCapacity> {
    // Validate quantity is positive
    if (quantity <= 0) {
      throw new ValidationError([{
        field: 'quantity',
        message: 'Quantity must be greater than zero'
      }]);
    }

    // Use transaction with row locking to prevent race conditions
    return await this.db.transaction(async (trx) => {
      // Lock the row for update to prevent concurrent reservations
      const capacity = await trx('event_capacity')
        .where({ id: capacityId, tenant_id: tenantId })
        .forUpdate()
        .first();

      if (!capacity) {
        throw new NotFoundError('Capacity section');
      }

      // Check availability after lock is acquired
      if (capacity.available_capacity < quantity) {
        throw new ValidationError([{
          field: 'quantity',
          message: `Only ${capacity.available_capacity} tickets available`
        }]);
      }

      const reservedExpiresAt = new Date();
      reservedExpiresAt.setMinutes(reservedExpiresAt.getMinutes() + reservationMinutes);

      // Lock price if pricing_id provided
      let lockedPriceData = null;
      if (pricingId && authToken) {
        const pricing = await trx('event_pricing')
          .where({ id: pricingId, tenant_id: tenantId })
          .first();

        if (pricing) {
          // Parse decimals to numbers for locked price
          const currentPrice = typeof pricing.current_price === 'string'
            ? parseFloat(pricing.current_price)
            : pricing.current_price;
          const basePrice = typeof pricing.base_price === 'string'
            ? parseFloat(pricing.base_price)
            : pricing.base_price;
          const serviceFee = typeof pricing.service_fee === 'string'
            ? parseFloat(pricing.service_fee)
            : pricing.service_fee;
          const facilityFee = typeof pricing.facility_fee === 'string'
            ? parseFloat(pricing.facility_fee)
            : pricing.facility_fee;
          const taxRate = typeof pricing.tax_rate === 'string'
            ? parseFloat(pricing.tax_rate)
            : pricing.tax_rate;

          lockedPriceData = {
            pricing_id: pricingId,
            locked_price: currentPrice || basePrice,
            locked_at: new Date(),
            service_fee: serviceFee,
            facility_fee: facilityFee,
            tax_rate: taxRate
          };
        }
      }

      // Update with the locked row
      const [updated] = await trx('event_capacity')
        .where({ id: capacityId, tenant_id: tenantId })
        .update({
          available_capacity: trx.raw('available_capacity - ?', [quantity]),
          reserved_capacity: trx.raw('COALESCE(reserved_capacity, 0) + ?', [quantity]),
          reserved_at: new Date(),
          reserved_expires_at: reservedExpiresAt,
          locked_price_data: lockedPriceData,
          updated_at: new Date()
        })
        .returning('*');

      logger.info({
        capacityId,
        quantity,
        expiresAt: reservedExpiresAt,
        priceLockedAt: lockedPriceData?.locked_price,
        tenantId
      }, 'Capacity reserved with row lock');

      // Parse locked_price_data before returning
      if (updated.locked_price_data) {
        updated.locked_price_data = this.parseLockedPriceData(updated.locked_price_data);
      }

      return updated;
    });
  }

  async releaseReservation(capacityId: string, quantity: number, tenantId: string): Promise<IEventCapacity> {
    const [updated] = await this.db('event_capacity')
      .where({ id: capacityId, tenant_id: tenantId })
      .update({
        available_capacity: this.db.raw('available_capacity + ?', [quantity]),
        reserved_capacity: this.db.raw('COALESCE(reserved_capacity, 0) - ?', [quantity]),
        reserved_at: null,
        reserved_expires_at: null,
        locked_price_data: null,
        updated_at: new Date()
      })
      .returning('*');

    logger.info({ capacityId, quantity, tenantId }, 'Reservation released');

    return updated;
  }

  async confirmReservation(capacityId: string, quantity: number, tenantId: string): Promise<IEventCapacity> {
    const [updated] = await this.db('event_capacity')
      .where({ id: capacityId, tenant_id: tenantId })
      .update({
        reserved_capacity: this.db.raw('COALESCE(reserved_capacity, 0) - ?', [quantity]),
        sold_count: this.db.raw('COALESCE(sold_count, 0) + ?', [quantity]),
        reserved_at: null,
        reserved_expires_at: null,
        locked_price_data: null,
        updated_at: new Date()
      })
      .returning('*');

    logger.info({ capacityId, quantity, tenantId }, 'Reservation confirmed as sold');

    return updated;
  }

  async releaseExpiredReservations(): Promise<number> {
    const now = new Date();

    const expiredSections = await this.db('event_capacity')
      .where('reserved_expires_at', '<=', now)
      .whereNotNull('reserved_expires_at')
      .where('reserved_capacity', '>', 0)
      .select('*');

    if (expiredSections.length === 0) {
      return 0;
    }

    let totalReleased = 0;

    for (const section of expiredSections) {
      await this.db('event_capacity')
        .where({ id: section.id })
        .update({
          available_capacity: this.db.raw('available_capacity + reserved_capacity'),
          reserved_capacity: 0,
          reserved_at: null,
          reserved_expires_at: null,
          locked_price_data: null,
          updated_at: new Date()
        });

      totalReleased += section.reserved_capacity;
    }

    logger.info({
      releasedCount: totalReleased,
      expiredSections: expiredSections.length
    }, 'Expired reservations released');

    return totalReleased;
  }

  async getTotalEventCapacity(eventId: string, tenantId: string): Promise<{
    total_capacity: number;
    available_capacity: number;
    reserved_capacity: number;
    sold_count: number;
  }> {
    const result = await this.db('event_capacity')
      .where({ event_id: eventId, tenant_id: tenantId })
      .sum('total_capacity as total_capacity')
      .sum('available_capacity as available_capacity')
      .sum('reserved_capacity as reserved_capacity')
      .sum('sold_count as sold_count')
      .first();

    return {
      total_capacity: parseInt(result?.total_capacity || '0', 10),
      available_capacity: parseInt(result?.available_capacity || '0', 10),
      reserved_capacity: parseInt(result?.reserved_capacity || '0', 10),
      sold_count: parseInt(result?.sold_count || '0', 10)
    };
  }

  /**
   * Validate that total section capacity doesn't exceed venue max capacity
   * Skips validation if venueClient is not configured
   */
  async validateVenueCapacity(
    eventId: string,
    tenantId: string,
    authToken: string,
    additionalCapacity: number = 0
  ): Promise<void> {
    // Skip validation if venue client not configured
    if (!this.venueClient) {
      logger.debug({ eventId }, 'Skipping venue capacity validation - no venue client configured');
      return;
    }

    // Get all sections for this event
    const sections = await this.getEventCapacity(eventId, tenantId);
    const currentTotalCapacity = sections.reduce((sum, s) => sum + s.total_capacity, 0);
    const newTotalCapacity = currentTotalCapacity + additionalCapacity;

    // Get the event to find venue_id
    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    try {
      const venueData = await this.venueClient.getVenue(event.venue_id, authToken);
      const venue = venueData.venue || venueData;

      if (!venue.max_capacity) {
        logger.warn({ venueId: event.venue_id }, 'Venue has no max_capacity set');
        return;
      }

      if (newTotalCapacity > venue.max_capacity) {
        throw new ValidationError([{
          field: 'total_capacity',
          message: `Total section capacity (${newTotalCapacity}) would exceed venue maximum (${venue.max_capacity})`
        }]);
      }

      logger.debug({
        eventId,
        currentTotalCapacity,
        additionalCapacity,
        newTotalCapacity,
        venueMaxCapacity: venue.max_capacity
      }, 'Venue capacity validation passed');
    } catch (error: any) {
      // If it's a validation error, rethrow it
      if (error instanceof ValidationError) {
        throw error;
      }
      // For other errors (network, etc.), log and skip validation
      logger.warn({ eventId, error: error.message }, 'Could not validate venue capacity - skipping');
    }
  }

  /**
   * Get locked price for a reservation
   */
  async getLockedPrice(capacityId: string, tenantId: string): Promise<any> {
    const capacity = await this.getCapacityById(capacityId, tenantId);
    return this.parseLockedPriceData(capacity.locked_price_data);
  }
}
