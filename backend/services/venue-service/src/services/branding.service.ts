import { db } from '../config/database';
import { logger } from '../utils/logger';

export interface BrandingConfig {
  venueId: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  headingFont?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  emailHeaderImage?: string;
  ticketBackgroundImage?: string;
  customCss?: string;
  emailFromName?: string;
  emailReplyTo?: string;
  emailFooterText?: string;
  ticketHeaderText?: string;
  ticketFooterText?: string;
  ogImageUrl?: string;
  ogDescription?: string;
}

// Map camelCase to snake_case for database columns
function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const snakeCaseMap: Record<string, string> = {
    primaryColor: 'primary_color',
    secondaryColor: 'secondary_color',
    accentColor: 'accent_color',
    textColor: 'text_color',
    backgroundColor: 'background_color',
    fontFamily: 'font_family',
    headingFont: 'heading_font',
    logoUrl: 'logo_url',
    logoDarkUrl: 'logo_dark_url',
    faviconUrl: 'favicon_url',
    emailHeaderImage: 'email_header_image',
    ticketBackgroundImage: 'ticket_background_image',
    customCss: 'custom_css',
    emailFromName: 'email_from_name',
    emailReplyTo: 'email_reply_to',
    emailFooterText: 'email_footer_text',
    ticketHeaderText: 'ticket_header_text',
    ticketFooterText: 'ticket_footer_text',
    ogImageUrl: 'og_image_url',
    ogDescription: 'og_description',
  };

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      const snakeKey = snakeCaseMap[key] || key;
      result[snakeKey] = value;
    }
  }
  return result;
}

export class BrandingService {
  /**
   * Get branding configuration for a venue
   */
  async getBrandingByVenueId(venueId: string): Promise<any> {
    try {
      const branding = await db('venue_branding')
        .where('venue_id', venueId)
        .first();

      if (!branding) {
        return this.getDefaultBranding();
      }

      return branding;
    } catch (error) {
      logger.error('Error getting branding by venue ID:', error);
      throw error;
    }
  }

  /**
   * Get branding configuration by custom domain
   */
  async getBrandingByDomain(domain: string): Promise<any> {
    try {
      // First, find the venue by custom domain
      const venue = await db('venues')
        .where('custom_domain', domain)
        .first();

      if (!venue) {
        return null;
      }

      // Then get the branding
      const branding = await db('venue_branding')
        .where('venue_id', venue.id)
        .first();

      return {
        venue,
        branding: branding || this.getDefaultBranding()
      };
    } catch (error) {
      logger.error('Error getting branding by domain:', error);
      throw error;
    }
  }

  /**
   * Create or update branding configuration
   */
  async upsertBranding(config: BrandingConfig): Promise<any> {
    try {
      const { venueId, ...brandingData } = config;

      // Check if venue exists
      const venue = await db('venues').where('id', venueId).first();
      if (!venue) {
        throw new Error('Venue not found');
      }

      // Check if venue has white-label tier
      if (venue.pricing_tier === 'standard') {
        throw new Error('Branding customization requires white-label or enterprise tier');
      }

      // Validate colors
      if (brandingData.primaryColor) {
        this.validateHexColor(brandingData.primaryColor);
      }
      if (brandingData.secondaryColor) {
        this.validateHexColor(brandingData.secondaryColor);
      }
      if (brandingData.accentColor) {
        this.validateHexColor(brandingData.accentColor);
      }
      if (brandingData.textColor) {
        this.validateHexColor(brandingData.textColor);
      }
      if (brandingData.backgroundColor) {
        this.validateHexColor(brandingData.backgroundColor);
      }

      // Convert camelCase to snake_case for database
      const dbData = toSnakeCase(brandingData);

      // Check if branding exists
      const existing = await db('venue_branding')
        .where('venue_id', venueId)
        .first();

      let result;
      if (existing) {
        // Update
        result = await db('venue_branding')
          .where('venue_id', venueId)
          .update({
            ...dbData,
            updated_at: new Date()
          })
          .returning('*');
      } else {
        // Insert
        result = await db('venue_branding')
          .insert({
            venue_id: venueId,
            ...dbData
          })
          .returning('*');
      }

      logger.info('Branding updated', { venueId });
      return result[0];
    } catch (error) {
      logger.error('Error upserting branding:', error);
      throw error;
    }
  }

  /**
   * Get pricing tier details
   */
  async getPricingTier(tierName: string): Promise<any> {
    try {
      const tier = await db('white_label_pricing')
        .where('tier_name', tierName)
        .first();

      return tier;
    } catch (error) {
      logger.error('Error getting pricing tier:', error);
      throw error;
    }
  }

  /**
   * Get all pricing tiers
   */
  async getAllPricingTiers(): Promise<any[]> {
    try {
      const tiers = await db('white_label_pricing')
        .orderBy('monthly_fee', 'asc');

      return tiers;
    } catch (error) {
      logger.error('Error getting all pricing tiers:', error);
      throw error;
    }
  }

  /**
   * Upgrade/downgrade venue tier
   */
  async changeTier(venueId: string, newTier: string, changedBy: string, reason?: string): Promise<void> {
    try {
      // Validate new tier exists
      const tierConfig = await this.getPricingTier(newTier);
      if (!tierConfig) {
        throw new Error('Invalid pricing tier');
      }

      // Get current tier
      const venue = await db('venues').where('id', venueId).first();
      if (!venue) {
        throw new Error('Venue not found');
      }

      const oldTier = venue.pricing_tier;

      // Update venue tier
      await db('venues')
        .where('id', venueId)
        .update({
          pricing_tier: newTier,
          hide_platform_branding: tierConfig.hide_platform_branding,
          updated_at: new Date()
        });

      // Record in history
      await db('venue_tier_history').insert({
        venue_id: venueId,
        from_tier: oldTier,
        to_tier: newTier,
        reason,
        changed_by: changedBy
      });

      // If downgrading from white-label, remove custom domain
      if (oldTier !== 'standard' && newTier === 'standard') {
        await db('venues')
          .where('id', venueId)
          .update({ custom_domain: null });

        await db('custom_domains')
          .where('venue_id', venueId)
          .update({ status: 'suspended' });
      }

      logger.info('Venue tier changed', { venueId, oldTier, newTier, changedBy });
    } catch (error) {
      logger.error('Error changing venue tier:', error);
      throw error;
    }
  }

  /**
   * Get tier history for a venue
   */
  async getTierHistory(venueId: string): Promise<any[]> {
    try {
      const history = await db('venue_tier_history')
        .where('venue_id', venueId)
        .orderBy('changed_at', 'desc');

      return history;
    } catch (error) {
      logger.error('Error getting tier history:', error);
      throw error;
    }
  }

  /**
   * Generate CSS variables from branding config
   */
  generateCssVariables(branding: any): string {
    return `
      :root {
        --brand-primary: ${branding.primary_color || '#667eea'};
        --brand-secondary: ${branding.secondary_color || '#764ba2'};
        --brand-accent: ${branding.accent_color || '#f093fb'};
        --brand-text: ${branding.text_color || '#333333'};
        --brand-background: ${branding.background_color || '#ffffff'};
        --brand-font: ${branding.font_family || 'Inter'}, sans-serif;
        --brand-heading-font: ${branding.heading_font || branding.font_family || 'Inter'}, sans-serif;
      }
      ${branding.custom_css || ''}
    `.trim();
  }

  /**
   * Validate hex color format
   */
  private validateHexColor(color: string): void {
    const hexRegex = /^#[0-9A-F]{6}$/i;
    if (!hexRegex.test(color)) {
      throw new Error(`Invalid hex color: ${color}`);
    }
  }

  /**
   * Get default branding (TicketToken branding)
   */
  private getDefaultBranding(): any {
    return {
      primary_color: '#667eea',
      secondary_color: '#764ba2',
      accent_color: '#f093fb',
      text_color: '#333333',
      background_color: '#ffffff',
      font_family: 'Inter',
      heading_font: 'Inter',
      logo_url: null,
      logo_dark_url: null,
      favicon_url: null,
      email_header_image: null,
      ticket_background_image: null,
      custom_css: null,
      email_from_name: 'TicketToken',
      email_reply_to: 'support@tickettoken.com',
      email_footer_text: 'Powered by TicketToken',
      ticket_header_text: 'Your Ticket',
      ticket_footer_text: 'Powered by TicketToken',
      og_image_url: null,
      og_description: 'Get tickets on TicketToken'
    };
  }
}

export const brandingService = new BrandingService();
