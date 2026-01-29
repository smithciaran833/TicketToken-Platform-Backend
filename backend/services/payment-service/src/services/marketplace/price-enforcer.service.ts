import { query } from '../../config/database';
import { ResaleListing } from '../../types';

/**
 * SECURITY: Explicit field lists to prevent SELECT * from exposing data.
 */
const VENUE_PRICE_RULE_FIELDS = 'id, tenant_id, venue_id, max_markup_percentage, min_markup_percentage, is_active, created_at, updated_at';
const RESALE_LISTING_FIELDS = 'id, tenant_id, ticket_id, venue_id, seller_id, price, original_price, status, created_at, updated_at';

export class PriceEnforcerService {
  async validateListingPrice(
    ticketId: string,
    listingPrice: number,
    venueId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    originalPrice?: number;
    maxAllowedPrice?: number;
    minAllowedPrice?: number;
  }> {
    // Get original ticket price
    const ticket = await this.getTicket(ticketId);
    const originalPrice = ticket.price;
    
    // Get venue price cap settings
    const priceRules = await this.getVenuePriceRules(venueId);
    
    // Calculate allowed price range
    const maxMarkup = priceRules?.maxMarkupPercentage ?? 150; // Default 150% markup
    const minMarkdown = priceRules?.minMarkdownPercentage ?? 50; // Can't sell below 50% of face value
    
    const maxAllowedPrice = originalPrice * (maxMarkup / 100);
    const minAllowedPrice = originalPrice * (minMarkdown / 100);
    
    // Validate listing price
    if (listingPrice > maxAllowedPrice) {
      return {
        valid: false,
        reason: `Price exceeds maximum allowed markup of ${maxMarkup - 100}%`,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    if (listingPrice < minAllowedPrice) {
      return {
        valid: false,
        reason: `Price below minimum allowed price (${minMarkdown}% of face value)`,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    // Check for suspicious pricing patterns
    const suspiciousPattern = await this.checkSuspiciousPricing(
      listingPrice,
      originalPrice,
      venueId
    );
    
    if (suspiciousPattern) {
      return {
        valid: false,
        reason: suspiciousPattern.reason,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    return {
      valid: true,
      originalPrice,
      maxAllowedPrice,
      minAllowedPrice
    };
  }
  
  async enforceDynamicPriceCaps(
    eventId: string,
    currentDemand: number
  ): Promise<{
    maxMarkupPercentage: number;
    reason: string;
  }> {
    // Get event details
    const event = await this.getEvent(eventId);
    const daysUntilEvent = this.getDaysUntilEvent(event.date);
    
    let maxMarkup = 150; // Base 150% markup
    let reason = 'Standard pricing rules';
    
    // Adjust based on time until event
    if (daysUntilEvent <= 1) {
      maxMarkup = 200; // Allow higher markup for last-minute sales
      reason = 'Last-minute pricing allowed';
    } else if (daysUntilEvent <= 7) {
      maxMarkup = 175;
      reason = 'Week-of-event pricing';
    }
    
    // Adjust based on demand
    if (currentDemand > 0.9) { // 90% sold
      maxMarkup = Math.min(maxMarkup + 50, 300); // Cap at 300%
      reason = 'High demand adjustment';
    }
    
    // Special events can have different rules
    if (event.category === 'charity') {
      maxMarkup = 100; // No markup for charity events
      reason = 'Charity event - no markup allowed';
    }
    
    return {
      maxMarkupPercentage: maxMarkup,
      reason
    };
  }
  
  private async checkSuspiciousPricing(
    listingPrice: number,
    originalPrice: number,
    venueId: string
  ): Promise<{ reason: string } | null> {
    // Check for round number scalping (e.g., $50 ticket listed at exactly $500)
    if (listingPrice % 100 === 0 && listingPrice / originalPrice > 5) {
      return { reason: 'Suspicious round number pricing detected' };
    }
    
    // Check for pattern of high markups from venue
    const recentListings = await this.getRecentListings(venueId, 24); // Last 24 hours
    const highMarkupCount = recentListings.filter(
      listing => listing.price / listing.originalPrice > 2
    ).length;
    
    if (highMarkupCount > 10) {
      return { reason: 'Unusual pattern of high markups detected' };
    }
    
    return null;
  }
  
  private async getTicket(ticketId: string): Promise<any> {
    // This would integrate with ticket service
    return { price: 50 }; // Mock
  }
  
  private async getEvent(eventId: string): Promise<any> {
    // This would integrate with event service
    return { date: new Date(), category: 'concert' }; // Mock
  }
  
  private async getVenuePriceRules(venueId: string): Promise<any> {
    // SECURITY: Use explicit field list instead of SELECT *
    const result = await query(
      `SELECT ${VENUE_PRICE_RULE_FIELDS} FROM venue_price_rules WHERE venue_id = $1`,
      [venueId]
    );

    return result.rows[0];
  }
  
  private async getRecentListings(venueId: string, hours: number): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // SECURITY: Use explicit field list instead of SELECT *
    const result = await query(
      `SELECT ${RESALE_LISTING_FIELDS} FROM resale_listings
       WHERE venue_id = $1 AND created_at > $2`,
      [venueId, since]
    );

    return result.rows;
  }
  
  private getDaysUntilEvent(eventDate: Date): number {
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  async getPricingAnalytics(venueId: string): Promise<{
    averageMarkup: number;
    medianMarkup: number;
    violationsBlocked: number;
    totalListings: number;
  }> {
    const analyticsQuery = `
      SELECT 
        AVG((price - original_price) / original_price * 100) as avg_markup,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (price - original_price) / original_price * 100) as median_markup,
        COUNT(*) FILTER (WHERE status = 'blocked_price_violation') as violations_blocked,
        COUNT(*) as total_listings
      FROM resale_listings
      WHERE venue_id = $1
        AND created_at > CURRENT_DATE - INTERVAL '30 days'
    `;
    
    const result = await query(analyticsQuery, [venueId]);
    
    return {
      averageMarkup: parseFloat(result.rows[0].avg_markup || 0),
      medianMarkup: parseFloat(result.rows[0].median_markup || 0),
      violationsBlocked: parseInt(result.rows[0].violations_blocked || 0),
      totalListings: parseInt(result.rows[0].total_listings || 0)
    };
  }
}
