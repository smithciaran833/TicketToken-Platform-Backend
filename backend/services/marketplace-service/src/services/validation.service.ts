import { listingModel } from '../models/listing.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { constants } from '../config';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  ForbiddenError, 
  NotFoundError 
} from '../utils/errors';

export interface ValidateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;
  originalFaceValue: number;
  eventStartTime: Date;
}

export interface ValidateTransferInput {
  listingId: string;
  buyerId: string;
  buyerWallet: string;
  eventStartTime: Date;
}

export interface PriceValidationResult {
  valid: boolean;
  reason?: string;
  minPrice?: number;
  maxPrice?: number;
  priceMultiplier?: number;
}

export class ValidationService {
  private log = logger.child({ component: 'ValidationService' });

  /**
   * Validate if a ticket can be listed
   */
  async validateListingCreation(input: ValidateListingInput): Promise<void> {
    // 1. Check if ticket is already listed
    const existingListing = await listingModel.findByTicketId(input.ticketId);
    if (existingListing) {
      throw new ValidationError('Ticket is already listed');
    }

    // 2. Get venue settings
    const venueSettings = await venueSettingsModel.findByVenueId(input.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 3. Validate price
    const priceValidation = this.validatePrice(
      input.price,
      input.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );

    if (!priceValidation.valid) {
      throw new ValidationError(priceValidation.reason || 'Invalid price');
    }

    // 4. Check listing timing
    this.validateListingTiming(
      input.eventStartTime,
      venueSettings.listingAdvanceHours
    );

    // 5. Check user listing limits
    await this.validateUserListingLimits(
      input.sellerId,
      input.eventId,
      venueSettings.maxListingsPerUserPerEvent,
      venueSettings.maxListingsPerUserTotal
    );

    this.log.info('Listing validation passed', {
      ticketId: input.ticketId,
      price: input.price,
      priceMultiplier: priceValidation.priceMultiplier,
    });
  }

  /**
   * Validate if a transfer can proceed
   */
  async validateTransfer(input: ValidateTransferInput): Promise<void> {
    // 1. Get venue settings
    const listing = await listingModel.findById(input.listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.status !== 'active') {
      throw new ValidationError(`Listing is ${listing.status}`);
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    // 2. Check transfer timing
    this.validateTransferTiming(
      input.eventStartTime,
      venueSettings.transferCutoffHours
    );

    // 3. Validate buyer is not seller
    if (input.buyerId === listing.sellerId) {
      throw new ValidationError('Cannot buy your own listing');
    }

    // 4. Check if listing has expired
    if (listing.expiresAt && new Date() > listing.expiresAt) {
      throw new ValidationError('Listing has expired');
    }

    this.log.info('Transfer validation passed', {
      listingId: input.listingId,
      buyerId: input.buyerId,
    });
  }

  /**
   * Validate listing price
   */
  validatePrice(
    price: number,
    originalFaceValue: number,
    minMultiplier: number,
    maxMultiplier: number,
    allowBelowFace: boolean
  ): PriceValidationResult {
    const priceMultiplier = price / originalFaceValue;
    const minPrice = originalFaceValue * minMultiplier;
    const maxPrice = originalFaceValue * maxMultiplier;

    // Check minimum price
    if (!allowBelowFace && price < originalFaceValue) {
      return {
        valid: false,
        reason: 'Price cannot be below face value',
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price < minPrice) {
      return {
        valid: false,
        reason: `Price must be at least ${minMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check maximum price
    if (price > maxPrice) {
      return {
        valid: false,
        reason: `Price cannot exceed ${maxMultiplier}x face value`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    // Check absolute limits
    if (price < constants.LISTING_CONSTRAINTS.MIN_PRICE) {
      return {
        valid: false,
        reason: `Price must be at least $${constants.LISTING_CONSTRAINTS.MIN_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    if (price > constants.LISTING_CONSTRAINTS.MAX_PRICE) {
      return {
        valid: false,
        reason: `Price cannot exceed $${constants.LISTING_CONSTRAINTS.MAX_PRICE}`,
        minPrice,
        maxPrice,
        priceMultiplier,
      };
    }

    return {
      valid: true,
      minPrice,
      maxPrice,
      priceMultiplier,
    };
  }

  /**
   * Validate listing timing
   */
  private validateListingTiming(
    eventStartTime: Date,
    listingAdvanceHours: number
  ): void {
    const now = new Date();
    const maxListingTime = new Date(eventStartTime);
    maxListingTime.setHours(maxListingTime.getHours() - listingAdvanceHours);

    if (now < maxListingTime) {
      throw new ValidationError(
        `Cannot list tickets more than ${listingAdvanceHours} hours before event`
      );
    }

    if (now >= eventStartTime) {
      throw new ValidationError('Cannot list tickets for past events');
    }
  }

  /**
   * Validate transfer timing
   */
  private validateTransferTiming(
    eventStartTime: Date,
    transferCutoffHours: number
  ): void {
    const now = new Date();
    const cutoffTime = new Date(eventStartTime);
    cutoffTime.setHours(cutoffTime.getHours() - transferCutoffHours);

    if (now >= cutoffTime) {
      throw new ValidationError(
        `Transfers are not allowed within ${transferCutoffHours} hours of event start`
      );
    }
  }

  /**
   * Validate user listing limits
   */
  private async validateUserListingLimits(
    userId: string,
    eventId: string,
    maxPerEvent: number,
    maxTotal: number
  ): Promise<void> {
    // Check per-event limit
    const eventListings = await listingModel.countByUserId(userId, eventId);
    if (eventListings >= maxPerEvent) {
      throw new ValidationError(
        `You can only have ${maxPerEvent} active listings per event`
      );
    }

    // Check total limit
    const totalListings = await listingModel.countByUserId(userId);
    if (totalListings >= maxTotal) {
      throw new ValidationError(
        `You can only have ${maxTotal} total active listings`
      );
    }
  }

  /**
   * Validate wallet address
   */
  validateWalletAddress(address: string): boolean {
    // Basic Solana address validation
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  }

  /**
   * Check if price update is valid
   */
  async validatePriceUpdate(
    listingId: string,
    newPrice: number,
    userId: string
  ): Promise<PriceValidationResult> {
    const listing = await listingModel.findById(listingId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenError('You can only update your own listings');
    }

    if (listing.status !== 'active') {
      throw new ValidationError('Can only update active listings');
    }

    const venueSettings = await venueSettingsModel.findByVenueId(listing.venueId);
    if (!venueSettings) {
      throw new NotFoundError('Venue marketplace settings not found');
    }

    return this.validatePrice(
      newPrice,
      listing.originalFaceValue,
      venueSettings.minPriceMultiplier,
      venueSettings.maxResaleMultiplier,
      venueSettings.allowBelowFace
    );
  }
}

export const validationService = new ValidationService();
