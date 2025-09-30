import { logger } from '../utils/logger';
import { db } from '../config/database';
import { ValidationError } from '../utils/errors';

class VenueRulesServiceClass {
  async validateListing(listing: any, venueId: string) {
    try {
      const venueSettings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      if (!venueSettings) {
        return { isValid: true };
      }
      
      const rules = venueSettings.rules || {};
      const errors: string[] = [];
      
      // Check max markup
      if (rules.max_markup_percentage) {
        const maxPrice = listing.face_value * (1 + rules.max_markup_percentage / 100);
        if (listing.price > maxPrice) {
          errors.push(`Price exceeds maximum ${rules.max_markup_percentage}% markup`);
        }
      }
      
      // Check min markup
      if (rules.min_markup_percentage) {
        const minPrice = listing.face_value * (1 + rules.min_markup_percentage / 100);
        if (listing.price < minPrice) {
          errors.push(`Price below minimum ${rules.min_markup_percentage}% markup`);
        }
      }
      
      // Check days before event
      if (rules.min_days_before_event) {
        const eventDate = new Date(listing.event_date);
        const daysUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilEvent < rules.min_days_before_event) {
          errors.push(`Cannot list tickets less than ${rules.min_days_before_event} days before event`);
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error('Error validating listing:', error);
      return { isValid: true };
    }
  }
  
  async checkMaxMarkup(price: number, faceValue: number, venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      if (!settings?.rules?.max_markup_percentage) {
        return true;
      }
      
      const maxPrice = faceValue * (1 + settings.rules.max_markup_percentage / 100);
      return price <= maxPrice;
    } catch (error) {
      logger.error('Error checking max markup:', error);
      return true;
    }
  }
  
  async requiresApproval(venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      return settings?.rules?.requires_approval || false;
    } catch (error) {
      logger.error('Error checking approval requirement:', error);
      return false;
    }
  }
  
  async getVenueRestrictions(venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      return settings?.rules || {};
    } catch (error) {
      logger.error('Error getting venue restrictions:', error);
      return {};
    }
  }
}

export const venueRulesService = new VenueRulesServiceClass();
