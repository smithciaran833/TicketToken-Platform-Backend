import { Knex } from 'knex';
import { EventPricingModel, IEventPricing } from '../models';
import { NotFoundError, ValidationError } from '../types';
import { pino } from 'pino';

const logger = pino({ name: 'pricing-service' });

/**
 * CRITICAL FIX: Add conflict error for optimistic locking
 */
export class PricingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingConflictError';
  }
}

export class PricingService {
  private pricingModel: EventPricingModel;

  constructor(private db: Knex) {
    this.pricingModel = new EventPricingModel(db);
  }

  private parseDecimalFields(pricing: any): any {
    const decimalFields = [
      'base_price', 'current_price', 'service_fee', 'facility_fee', 'tax_rate',
      'early_bird_price', 'last_minute_price', 'min_price', 'max_price',
      'group_discount_rate', 'member_discount_rate'
    ];

    const parsed = { ...pricing };
    decimalFields.forEach(field => {
      if (parsed[field] !== null && parsed[field] !== undefined) {
        parsed[field] = typeof parsed[field] === 'string'
          ? parseFloat(parsed[field])
          : parsed[field];
      }
    });

    return parsed;
  }

  /**
   * HIGH PRIORITY FIX #2: Validate pricing date logic
   * Ensures:
   * - sales_end_at > sales_start_at
   * - early_bird_ends_at < sales_start_at (when both set)
   */
  private validatePricingDates(data: Partial<IEventPricing>, existing?: IEventPricing): void {
    const salesStartAt = data.sales_start_at || existing?.sales_start_at;
    const salesEndAt = data.sales_end_at || existing?.sales_end_at;
    const earlyBirdEndsAt = data.early_bird_ends_at || existing?.early_bird_ends_at;

    // Validate sales_end_at > sales_start_at
    if (salesStartAt && salesEndAt) {
      const startDate = new Date(salesStartAt);
      const endDate = new Date(salesEndAt);

      if (endDate <= startDate) {
        throw new ValidationError([{
          field: 'sales_end_at',
          message: 'Sales end time must be after sales start time'
        }]);
      }
    }

    // Validate early_bird_ends_at < sales_start_at
    if (earlyBirdEndsAt && salesStartAt) {
      const earlyBirdEnd = new Date(earlyBirdEndsAt);
      const salesStart = new Date(salesStartAt);

      if (earlyBirdEnd >= salesStart) {
        throw new ValidationError([{
          field: 'early_bird_ends_at',
          message: 'Early bird period must end before sales start time'
        }]);
      }
    }
  }

  /**
   * HIGH PRIORITY FIX #4: Validate price range logic
   * Ensures:
   * - For dynamic pricing: min_price <= base_price <= max_price
   * - early_bird_price < base_price (when set)
   */
  private validatePriceRanges(data: Partial<IEventPricing>, existing?: IEventPricing): void {
    const isDynamic = data.is_dynamic !== undefined ? data.is_dynamic : existing?.is_dynamic;
    const basePrice = data.base_price !== undefined ? data.base_price : existing?.base_price;
    const minPrice = data.min_price !== undefined ? data.min_price : existing?.min_price;
    const maxPrice = data.max_price !== undefined ? data.max_price : existing?.max_price;
    const earlyBirdPrice = data.early_bird_price !== undefined ? data.early_bird_price : existing?.early_bird_price;

    // Validate dynamic pricing range: min_price <= base_price <= max_price
    if (isDynamic && minPrice !== undefined && maxPrice !== undefined && basePrice !== undefined) {
      if (minPrice > basePrice) {
        throw new ValidationError([{
          field: 'min_price',
          message: `Minimum price (${minPrice}) cannot exceed base price (${basePrice})`
        }]);
      }

      if (basePrice > maxPrice) {
        throw new ValidationError([{
          field: 'max_price',
          message: `Base price (${basePrice}) cannot exceed maximum price (${maxPrice})`
        }]);
      }

      if (minPrice > maxPrice) {
        throw new ValidationError([{
          field: 'min_price',
          message: `Minimum price (${minPrice}) cannot exceed maximum price (${maxPrice})`
        }]);
      }
    }

    // Validate early_bird_price < base_price
    if (earlyBirdPrice !== undefined && basePrice !== undefined) {
      if (earlyBirdPrice >= basePrice) {
        throw new ValidationError([{
          field: 'early_bird_price',
          message: `Early bird price (${earlyBirdPrice}) must be less than base price (${basePrice})`
        }]);
      }
    }
  }

  /**
   * MEDIUM PRIORITY FIX #10: Validate group discount configuration
   * Ensures group_size_min and group_discount_percentage are set together
   */
  private validateGroupDiscountConfig(data: Partial<IEventPricing>, existing?: IEventPricing): void {
    const groupSizeMin = data.group_size_min !== undefined ? data.group_size_min : existing?.group_size_min;
    const groupDiscountPercentage = data.group_discount_percentage !== undefined ? data.group_discount_percentage : existing?.group_discount_percentage;

    // Check if one is set but not the other
    if (groupSizeMin !== undefined && groupSizeMin !== null) {
      if (groupDiscountPercentage === undefined || groupDiscountPercentage === null) {
        throw new ValidationError([{
          field: 'group_discount_percentage',
          message: 'Group discount percentage is required when group_size_min is set'
        }]);
      }
    }

    if (groupDiscountPercentage !== undefined && groupDiscountPercentage !== null) {
      if (groupSizeMin === undefined || groupSizeMin === null) {
        throw new ValidationError([{
          field: 'group_size_min',
          message: 'Minimum group size is required when group discount percentage is set'
        }]);
      }
    }
  }

  /**
   * HIGH PRIORITY FIX #7: Validate dynamic pricing requirements
   * When is_dynamic = true, ensures required fields are present:
   * - min_price
   * - max_price
   * - price_adjustment_rules.demand_factor
   * - price_adjustment_rules.time_factor
   */
  private validateDynamicPricingRequirements(data: Partial<IEventPricing>, existing?: IEventPricing): void {
    const isDynamic = data.is_dynamic !== undefined ? data.is_dynamic : existing?.is_dynamic;

    if (!isDynamic) {
      return; // Not dynamic pricing, skip validation
    }

    const minPrice = data.min_price !== undefined ? data.min_price : existing?.min_price;
    const maxPrice = data.max_price !== undefined ? data.max_price : existing?.max_price;
    const priceAdjustmentRules = data.price_adjustment_rules || existing?.price_adjustment_rules;

    const errors: Array<{ field: string; message: string }> = [];

    if (minPrice === undefined || minPrice === null) {
      errors.push({
        field: 'min_price',
        message: 'Minimum price is required when dynamic pricing is enabled'
      });
    }

    if (maxPrice === undefined || maxPrice === null) {
      errors.push({
        field: 'max_price',
        message: 'Maximum price is required when dynamic pricing is enabled'
      });
    }

    if (!priceAdjustmentRules) {
      errors.push({
        field: 'price_adjustment_rules',
        message: 'Price adjustment rules are required when dynamic pricing is enabled'
      });
    } else {
      if (priceAdjustmentRules.demand_factor === undefined || priceAdjustmentRules.demand_factor === null) {
        errors.push({
          field: 'price_adjustment_rules.demand_factor',
          message: 'Demand factor is required in price adjustment rules for dynamic pricing'
        });
      }

      if (priceAdjustmentRules.time_factor === undefined || priceAdjustmentRules.time_factor === null) {
        errors.push({
          field: 'price_adjustment_rules.time_factor',
          message: 'Time factor is required in price adjustment rules for dynamic pricing'
        });
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  async getEventPricing(eventId: string, tenantId: string): Promise<IEventPricing[]> {
    const pricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId })
      .select('*');

    return pricing.map(p => this.parseDecimalFields(p));
  }

  async getPricingById(pricingId: string, tenantId: string): Promise<IEventPricing> {
    const pricing = await this.db('event_pricing')
      .where({ id: pricingId, tenant_id: tenantId })
      .first();

    if (!pricing) {
      throw new NotFoundError('Pricing');
    }

    return this.parseDecimalFields(pricing);
  }

  async createPricing(data: Partial<IEventPricing>, tenantId: string): Promise<IEventPricing> {
    if (data.base_price && data.base_price < 0) {
      throw new ValidationError([{ field: 'base_price', message: 'Base price must be positive' }]);
    }

    // HIGH PRIORITY FIX #2: Validate pricing dates
    this.validatePricingDates(data);

    // HIGH PRIORITY FIX #4: Validate price ranges
    this.validatePriceRanges(data);

    // HIGH PRIORITY FIX #7: Validate dynamic pricing requirements
    this.validateDynamicPricingRequirements(data);

    // MEDIUM PRIORITY FIX #10: Validate group discount configuration
    this.validateGroupDiscountConfig(data);

    const pricingData = {
      ...data,
      tenant_id: tenantId,
      current_price: data.current_price || data.base_price,
      is_active: data.is_active !== undefined ? data.is_active : true,
      is_visible: data.is_visible !== undefined ? data.is_visible : true,
      version: 1 // CRITICAL FIX: Initialize version for optimistic locking
    };

    const [pricing] = await this.db('event_pricing')
      .insert(pricingData)
      .returning('*');

    logger.info({ pricingId: pricing.id, eventId: data.event_id, tenantId }, 'Pricing created');

    return this.parseDecimalFields(pricing);
  }

  /**
   * CRITICAL FIX: Added optimistic locking with version checking
   */
  async updatePricing(
    pricingId: string, 
    data: Partial<IEventPricing>, 
    tenantId: string,
    expectedVersion?: number
  ): Promise<IEventPricing> {
    const existing = await this.getPricingById(pricingId, tenantId);

    if (data.base_price !== undefined && data.base_price < 0) {
      throw new ValidationError([{ field: 'base_price', message: 'Base price must be positive' }]);
    }

    // HIGH PRIORITY FIX #2: Validate pricing dates on updates
    this.validatePricingDates(data, existing);

    // HIGH PRIORITY FIX #4: Validate price ranges on updates
    this.validatePriceRanges(data, existing);

    // HIGH PRIORITY FIX #7: Validate dynamic pricing requirements on updates
    this.validateDynamicPricingRequirements(data, existing);

    // MEDIUM PRIORITY FIX #10: Validate group discount configuration on updates
    this.validateGroupDiscountConfig(data, existing);

    // CRITICAL FIX: Use transaction with row locking for updates
    return await this.db.transaction(async (trx) => {
      // Lock the row
      const current = await trx('event_pricing')
        .where({ id: pricingId, tenant_id: tenantId })
        .forUpdate()
        .first();

      if (!current) {
        throw new NotFoundError('Pricing');
      }

      // CRITICAL FIX: Check version if provided
      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        throw new PricingConflictError(
          `Pricing ${pricingId} was modified by another process. ` +
          `Expected version ${expectedVersion}, but current version is ${current.version}. ` +
          `Please refresh and try again.`
        );
      }

      const updateData = {
        ...data,
        updated_at: new Date(),
        version: trx.raw('COALESCE(version, 0) + 1') // Increment version
      };

      const [updated] = await trx('event_pricing')
        .where({ id: pricingId, tenant_id: tenantId })
        .update(updateData)
        .returning('*');

      logger.info({ pricingId, tenantId, newVersion: updated.version }, 'Pricing updated with version increment');

      return this.parseDecimalFields(updated);
    });
  }

  async calculatePrice(pricingId: string, quantity: number, tenantId: string): Promise<{
    base_price: number;
    service_fee: number;
    facility_fee: number;
    tax: number;
    subtotal: number;
    total: number;
    per_ticket: number;
  }> {
    const pricing = await this.getPricingById(pricingId, tenantId);

    const unitPrice = pricing.current_price || pricing.base_price;
    const baseTotal = unitPrice * quantity;

    const serviceFee = (pricing.service_fee || 0) * quantity;
    const facilityFee = (pricing.facility_fee || 0) * quantity;

    const subtotal = baseTotal + serviceFee + facilityFee;

    const taxRate = pricing.tax_rate || 0;
    const tax = subtotal * taxRate;

    const total = subtotal + tax;

    return {
      base_price: parseFloat(baseTotal.toFixed(2)),
      service_fee: parseFloat(serviceFee.toFixed(2)),
      facility_fee: parseFloat(facilityFee.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      per_ticket: parseFloat((total / quantity).toFixed(2))
    };
  }

  /**
   * CRITICAL FIX: Added optimistic locking to dynamic price updates
   */
  async updateDynamicPrice(
    pricingId: string, 
    newPrice: number, 
    tenantId: string,
    expectedVersion?: number
  ): Promise<IEventPricing> {
    // CRITICAL FIX: Use transaction with row locking
    return await this.db.transaction(async (trx) => {
      // Lock the row
      const pricing = await trx('event_pricing')
        .where({ id: pricingId, tenant_id: tenantId })
        .forUpdate()
        .first();

      if (!pricing) {
        throw new NotFoundError('Pricing');
      }

      if (!pricing.is_dynamic) {
        throw new ValidationError([{
          field: 'is_dynamic',
          message: 'This pricing tier does not support dynamic pricing'
        }]);
      }

      // Check version if provided
      if (expectedVersion !== undefined && pricing.version !== expectedVersion) {
        throw new PricingConflictError(
          `Pricing ${pricingId} was modified concurrently. Please refresh and try again.`
        );
      }

      // Validate against min/max
      if (pricing.min_price && newPrice < pricing.min_price) {
        throw new ValidationError([{
          field: 'price',
          message: `Price cannot be less than minimum (${pricing.min_price})`
        }]);
      }

      if (pricing.max_price && newPrice > pricing.max_price) {
        throw new ValidationError([{
          field: 'price',
          message: `Price cannot exceed maximum (${pricing.max_price})`
        }]);
      }

      const [updated] = await trx('event_pricing')
        .where({ id: pricingId, tenant_id: tenantId })
        .update({
          current_price: newPrice,
          updated_at: new Date(),
          version: trx.raw('COALESCE(version, 0) + 1')
        })
        .returning('*');

      logger.info({ 
        pricingId, 
        newPrice, 
        previousPrice: pricing.current_price,
        newVersion: updated.version 
      }, 'Dynamic price updated with row lock');

      return this.parseDecimalFields(updated);
    });
  }

  async getActivePricing(eventId: string, tenantId: string): Promise<IEventPricing[]> {
    const now = new Date();

    const pricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId, is_active: true, is_visible: true })
      .where(function() {
        this.whereNull('sales_start_at')
          .orWhere('sales_start_at', '<=', now);
      })
      .where(function() {
        this.whereNull('sales_end_at')
          .orWhere('sales_end_at', '>=', now);
      })
      .orderBy('display_order', 'asc')
      .select('*');

    return pricing.map(p => this.parseDecimalFields(p));
  }

  /**
   * Apply early bird pricing to eligible tiers
   * 
   * SCHEDULER REQUIREMENT:
   * This method must be called by a scheduled job (cron/background worker)
   * 
   * Suggested schedule: Run every hour
   * Example cron: 0 * * * * (every hour at minute 0)
   * 
   * Implementation options:
   * 1. Node-cron: https://www.npmjs.com/package/node-cron
   * 2. Bull Queue: https://www.npmjs.com/package/bull
   * 3. Kubernetes CronJob
   * 
   * TODO: Document in deployment/operations guide
   */
  async applyEarlyBirdPricing(eventId: string, tenantId: string): Promise<void> {
    const now = new Date();

    const earlyBirdPricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId })
      .whereNotNull('early_bird_price')
      .whereNotNull('early_bird_ends_at')
      .where('early_bird_ends_at', '>', now)
      .select('*');

    for (const pricing of earlyBirdPricing) {
      await this.updatePricing(pricing.id, {
        current_price: pricing.early_bird_price
      }, tenantId, pricing.version);
    }

    logger.info({ eventId, count: earlyBirdPricing.length, tenantId }, 'Applied early bird pricing');
  }

  /**
   * Apply last minute pricing to eligible tiers
   * 
   * SCHEDULER REQUIREMENT:
   * This method must be called by a scheduled job (cron/background worker)
   * 
   * Suggested schedule: Run every 30 minutes
   * Example cron: star-slash-30 * * * * (every 30 minutes)
   * 
   * TODO: Document in deployment/operations guide
   */
  async applyLastMinutePricing(eventId: string, tenantId: string): Promise<void> {
    const now = new Date();

    const lastMinutePricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId })
      .whereNotNull('last_minute_price')
      .whereNotNull('last_minute_starts_at')
      .where('last_minute_starts_at', '<=', now)
      .select('*');

    for (const pricing of lastMinutePricing) {
      await this.updatePricing(pricing.id, {
        current_price: pricing.last_minute_price
      }, tenantId, pricing.version);
    }

    logger.info({ eventId, count: lastMinutePricing.length, tenantId }, 'Applied last minute pricing');
  }
}
