import { Knex } from 'knex';
import { EventCapacityModel, IEventCapacity } from '../models';
import { NotFoundError, ValidationError } from '../types';
import { pino } from 'pino';
import { venueServiceClient, createRequestContext } from '@tickettoken/shared';

const logger = pino({ name: 'capacity-service' });

export class CapacityService {
  private capacityModel: EventCapacityModel;

  constructor(
    private db: Knex
  ) {
    this.capacityModel = new EventCapacityModel(db);
  }

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

  /**
   * HIGH PRIORITY FIX #3: Validate capacity math
   * Ensures available + reserved + sold <= total_capacity
   */
  private validateCapacityMath(data: Partial<IEventCapacity>): void {
    const totalCapacity = data.total_capacity ?? 0;
    const availableCapacity = data.available_capacity ?? 0;
    const reservedCapacity = data.reserved_capacity ?? 0;
    const soldCount = data.sold_count ?? 0;

    const allocated = availableCapacity + reservedCapacity + soldCount;

    if (allocated > totalCapacity) {
      throw new ValidationError([{
        field: 'total_capacity',
        message: `Capacity allocation (${allocated}) exceeds total capacity (${totalCapacity}). ` +
                 `Available: ${availableCapacity}, Reserved: ${reservedCapacity}, Sold: ${soldCount}`
      }]);
    }

    // Validate buffer capacity if provided
    if (data.buffer_capacity !== undefined) {
      const bufferCapacity = data.buffer_capacity;
      if (bufferCapacity > availableCapacity) {
        throw new ValidationError([{
          field: 'buffer_capacity',
          message: `Buffer capacity (${bufferCapacity}) cannot exceed available capacity (${availableCapacity})`
        }]);
      }
    }
  }

  /**
   * LOW PRIORITY FIX #16: Validate row configuration math
   * Ensures rows × seats_per_row = total_capacity (when row_config is provided)
   *
   * IMPLEMENTED: TODO #10 - Row Configuration Math Validation
   */
  private validateRowConfig(data: Partial<IEventCapacity>): void {
    const rowConfig = data.row_config as { rows?: number; seats_per_row?: number } | undefined;

    // Skip validation if no row_config provided
    if (!rowConfig) {
      return;
    }

    const rows = rowConfig.rows;
    const seatsPerRow = rowConfig.seats_per_row;

    // Skip if row_config is incomplete (partial config is allowed)
    if (rows === undefined || seatsPerRow === undefined) {
      return;
    }

    const totalCapacity = data.total_capacity;

    // Skip if total_capacity not provided (will be validated elsewhere)
    if (totalCapacity === undefined) {
      return;
    }

    const calculatedCapacity = rows * seatsPerRow;

    if (calculatedCapacity !== totalCapacity) {
      throw new ValidationError([{
        field: 'row_config',
        message: `Row configuration math invalid: ${rows} rows × ${seatsPerRow} seats/row = ${calculatedCapacity}, but total_capacity is ${totalCapacity}`
      }]);
    }

    logger.debug({
      rows,
      seatsPerRow,
      calculatedCapacity,
      totalCapacity
    }, 'Row configuration validated');
  }

  /**
   * HIGH PRIORITY FIX #5: Validate purchase limits
   * Ensures minimum_purchase <= maximum_purchase
   */
  private validatePurchaseLimits(data: Partial<IEventCapacity>): void {
    const minPurchase = data.minimum_purchase;
    const maxPurchase = data.maximum_purchase;

    if (minPurchase !== undefined && maxPurchase !== undefined) {
      if (minPurchase > maxPurchase) {
        throw new ValidationError([{
          field: 'minimum_purchase',
          message: `Minimum purchase (${minPurchase}) cannot exceed maximum purchase (${maxPurchase})`
        }]);
      }
    }
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

    // PHASE 5c REFACTORED: Always validate venue capacity using shared client
    if (data.event_id) {
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

    // HIGH PRIORITY FIX #3 & #5: Validate capacity math and purchase limits
    this.validateCapacityMath(capacityData);
    this.validatePurchaseLimits(capacityData);

    // LOW PRIORITY FIX #16: Validate row configuration math
    this.validateRowConfig(capacityData);

    const [capacity] = await this.db('event_capacity')
      .insert(capacityData)
      .returning('*');

    logger.info({ capacityId: capacity.id, eventId: data.event_id, tenantId }, 'Capacity created');

    return capacity;
  }

  async updateCapacity(capacityId: string, data: Partial<IEventCapacity>, tenantId: string, authToken?: string): Promise<IEventCapacity> {
    const existing = await this.getCapacityById(capacityId, tenantId);

    if (data.total_capacity !== undefined && data.total_capacity !== existing.total_capacity) {
      if (data.total_capacity < 0) {
        throw new ValidationError([
          { field: 'total_capacity', message: 'Capacity cannot be negative' }
        ]);
      }

      // PHASE 5c REFACTORED: Always validate venue capacity using shared client
      if (authToken) {
        const capacityDiff = data.total_capacity - existing.total_capacity;
        await this.validateVenueCapacity(existing.event_id, tenantId, authToken, capacityDiff);
      }
    }

    // LOW PRIORITY FIX #16: Validate row configuration math
    // Merge existing values with update data to validate the final state
    const mergedData: Partial<IEventCapacity> = {
      total_capacity: data.total_capacity ?? existing.total_capacity,
      row_config: data.row_config ?? existing.row_config,
    };
    this.validateRowConfig(mergedData);

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
    if (quantity <= 0) {
      throw new ValidationError([{
        field: 'quantity',
        message: 'Quantity must be greater than zero'
      }]);
    }

    return await this.db.transaction(async (trx) => {
      const capacity = await trx('event_capacity')
        .where({ id: capacityId, tenant_id: tenantId })
        .forUpdate()
        .first();

      if (!capacity) {
        throw new NotFoundError('Capacity section');
      }

      if (capacity.available_capacity < quantity) {
        throw new ValidationError([{
          field: 'quantity',
          message: `Only ${capacity.available_capacity} tickets available`
        }]);
      }

      const reservedExpiresAt = new Date();
      reservedExpiresAt.setMinutes(reservedExpiresAt.getMinutes() + reservationMinutes);

      let lockedPriceData = null;
      if (pricingId && authToken) {
        const pricing = await trx('event_pricing')
          .where({ id: pricingId, tenant_id: tenantId })
          .first();

        if (pricing) {
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

  /**
   * CRITICAL FIX: Wrapped in transaction for atomicity
   * Releases all expired reservations back to available capacity
   */
  async releaseExpiredReservations(): Promise<number> {
    const now = new Date();

    // CRITICAL FIX: Use transaction to ensure atomicity
    return await this.db.transaction(async (trx) => {
      // Find all expired sections with row locking
      const expiredSections = await trx('event_capacity')
        .where('reserved_expires_at', '<=', now)
        .whereNotNull('reserved_expires_at')
        .where('reserved_capacity', '>', 0)
        .forUpdate()
        .select('*');

      if (expiredSections.length === 0) {
        return 0;
      }

      let totalReleased = 0;

      // Update each section within the transaction
      for (const section of expiredSections) {
        await trx('event_capacity')
          .where({ id: section.id })
          .update({
            available_capacity: trx.raw('available_capacity + reserved_capacity'),
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
      }, 'Expired reservations released in transaction');

      return totalReleased;
    });
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

  async validateVenueCapacity(
    eventId: string,
    tenantId: string,
    authToken: string,
    additionalCapacity: number = 0
  ): Promise<void> {
    // PHASE 5c REFACTORED: Using shared venueServiceClient with standardized S2S auth
    const ctx = createRequestContext(tenantId);

    const sections = await this.getEventCapacity(eventId, tenantId);
    const currentTotalCapacity = sections.reduce((sum, s) => sum + s.total_capacity, 0);
    const newTotalCapacity = currentTotalCapacity + additionalCapacity;

    const event = await this.db('events')
      .where({ id: eventId, tenant_id: tenantId })
      .first();

    if (!event) {
      throw new NotFoundError('Event');
    }

    try {
      const venue = await venueServiceClient.getVenueInternal(event.venue_id, ctx);

      if (!venue.capacity) {
        logger.warn({ venueId: event.venue_id }, 'Venue has no capacity set');
        return;
      }

      if (newTotalCapacity > venue.capacity) {
        throw new ValidationError([{
          field: 'total_capacity',
          message: `Total section capacity (${newTotalCapacity}) would exceed venue maximum (${venue.capacity})`
        }]);
      }

      logger.debug({
        eventId,
        currentTotalCapacity,
        additionalCapacity,
        newTotalCapacity,
        venueMaxCapacity: venue.capacity
      }, 'Venue capacity validation passed');
    } catch (error: any) {
      if (error instanceof ValidationError) {
        throw error;
      }
      logger.warn({ eventId, error: error.message }, 'Could not validate venue capacity - skipping');
    }
  }

  async getLockedPrice(capacityId: string, tenantId: string): Promise<any> {
    const capacity = await this.getCapacityById(capacityId, tenantId);
    return this.parseLockedPriceData(capacity.locked_price_data);
  }
}
