import { db } from '../config/database';
import { logger } from '../utils/logger';
import { CacheIntegration } from './cache-integration';

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
  private cache?: CacheIntegration;

  constructor(cache?: CacheIntegration) {
    this.cache = cache;
  }

  /**
   * SECURITY FIX: Validate tenant context
   */
  private validateTenantContext(tenantId?: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for branding operations');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  /**
   * SECURITY FIX: Verify venue belongs to tenant
   */
  private async verifyVenueOwnership(venueId: string, tenantId: string): Promise<void> {
    const venue = await db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .first();
    
    if (!venue) {
      logger.warn({ venueId, tenantId }, 'Venue ownership verification failed');
      throw new Error('Venue not found or access denied');
    }
  }

  /**
   * SECURITY FIX: Sanitize custom CSS to prevent injection attacks
   */
  private sanitizeCustomCss(css: string): string {
    if (!css) return '';
    
    // Remove dangerous patterns
    const dangerous = [
      /@import/gi,
      /url\s*\(/gi,
      /expression\s*\(/gi,
      /javascript:/gi,
      /behavior:/gi,
      /vbscript:/gi,
      /-moz-binding/gi,
    ];
    
    let sanitized = css;
    dangerous.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '/* blocked */');
    });
    
    // Limit length
    return sanitized.slice(0, 50000);
  }

  /**
   * SECURITY FIX: Validate URL format and protocol
   */
  private validateUrl(url: string, fieldName: string): void {
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`${fieldName} must use HTTP or HTTPS`);
      }
    } catch {
      throw new Error(`Invalid ${fieldName}: ${url}`);
    }
  }

  /**
   * Get branding configuration for a venue
   */
  async getBrandingByVenueId(venueId: string, tenantId?: string): Promise<any> {
    if (tenantId) {
      this.validateTenantContext(tenantId);
      await this.verifyVenueOwnership(venueId, tenantId);
    }

    // Check cache first (5 min TTL)
    const cacheKey = `branding:${tenantId || 'global'}:${venueId}`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug({ venueId, tenantId }, 'Branding served from cache');
        return cached;
      }
    }

    try {
      const branding = await db('venue_branding')
        .where('venue_id', venueId)
        .first();

      const result = branding || this.getDefaultBranding();

      // Cache for 5 minutes
      if (this.cache) {
        await this.cache.set(cacheKey, result, 300).catch(err => {
          logger.warn({ err, venueId }, 'Failed to cache branding');
        });
      }

      return result;
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
  async upsertBranding(config: BrandingConfig, tenantId?: string): Promise<any> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(config.venueId, tenantId!);

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

      // SECURITY FIX: Validate URLs
      this.validateUrl(brandingData.logoUrl || '', 'logoUrl');
      this.validateUrl(brandingData.logoDarkUrl || '', 'logoDarkUrl');
      this.validateUrl(brandingData.faviconUrl || '', 'faviconUrl');
      this.validateUrl(brandingData.emailHeaderImage || '', 'emailHeaderImage');
      this.validateUrl(brandingData.ticketBackgroundImage || '', 'ticketBackgroundImage');
      this.validateUrl(brandingData.ogImageUrl || '', 'ogImageUrl');

      // SECURITY FIX: Sanitize custom CSS
      if (brandingData.customCss) {
        brandingData.customCss = this.sanitizeCustomCss(brandingData.customCss);
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
      // Atomic upsert using ON CONFLICT to handle concurrent updates
      const result = await db('venue_branding')
        .insert({
          venue_id: venueId,
          ...dbData,
          created_at: new Date(),
          updated_at: new Date()
        })
        .onConflict('venue_id')
        .merge({
          ...dbData,
          updated_at: new Date()
        })
        .returning('*');
      // Invalidate cache after update
      if (this.cache) {
        await this.cache.delete(`branding:${tenantId || 'global'}:${venueId}`).catch(err => {
          logger.warn({ err, venueId }, 'Failed to invalidate branding cache');
        });
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
   * SECURITY FIX: Added tenant isolation and transaction wrapping
   */
  async changeTier(venueId: string, newTier: string, changedBy: string, reason?: string, tenantId?: string): Promise<void> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId!);

    // SECURITY FIX: Wrap in transaction
    await db.transaction(async (trx) => {
      try {
        // Validate new tier exists
        const tierConfig = await trx('white_label_pricing')
          .where('tier_name', newTier)
          .first();
        
        if (!tierConfig) {
          throw new Error('Invalid pricing tier');
        }

        // Get current tier
        const venue = await trx('venues').where('id', venueId).first();
        if (!venue) {
          throw new Error('Venue not found');
        }

        const oldTier = venue.pricing_tier;

        // Update venue tier
        await trx('venues')
          .where('id', venueId)
          .update({
            pricing_tier: newTier,
            hide_platform_branding: tierConfig.hide_platform_branding,
            updated_at: new Date()
          });

        // Record in history
        await trx('venue_tier_history').insert({
          venue_id: venueId,
          from_tier: oldTier,
          to_tier: newTier,
          reason,
          changed_by: changedBy
        });

        // If downgrading from white-label, remove custom domain
        if (oldTier !== 'standard' && newTier === 'standard') {
          await trx('venues')
            .where('id', venueId)
            .update({ custom_domain: null });

          await trx('custom_domains')
            .where('venue_id', venueId)
            .update({ status: 'suspended' });
        }

        logger.info('Venue tier changed', { venueId, oldTier, newTier, changedBy });
      } catch (error) {
        logger.error('Error changing venue tier:', error);
        throw error;
      }
    });

    // Invalidate branding cache (tier affects branding)
    if (this.cache) {
      await this.cache.delete(`branding:${tenantId || 'global'}:${venueId}`).catch(err => {
        logger.warn({ err, venueId }, 'Failed to invalidate branding cache on tier change');
      });
    }
  }

  /**
   * Get tier history for a venue
   */
  async getTierHistory(venueId: string, tenantId?: string): Promise<any[]> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId!);

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
