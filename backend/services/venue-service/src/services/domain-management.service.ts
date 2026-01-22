import { db } from '../config/database';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import * as dns from 'dns/promises';

export interface CustomDomain {
  id: string;
  venueId: string;
  domain: string;
  verificationToken: string;
  verificationMethod: 'dns_txt' | 'dns_cname' | 'file_upload';
  isVerified: boolean;
  verifiedAt?: Date;
  sslStatus: 'pending' | 'active' | 'failed' | 'expired';
  sslProvider: string;
  sslIssuedAt?: Date;
  sslExpiresAt?: Date;
  status: 'pending' | 'active' | 'failed' | 'suspended';
  errorMessage?: string;
}

export class DomainManagementService {
  /**
   * SECURITY FIX: Validate tenant context
   */
  private validateTenantContext(tenantId?: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for domain operations');
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
   * SECURITY FIX: Add timeout to promises to prevent hanging
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMsg)), ms)
      )
    ]);
  }

  async addCustomDomain(venueId: string, domain: string, tenantId?: string): Promise<CustomDomain> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId!);
    try {
      this.validateDomainFormat(domain);

      const venue = await db('venues').where('id', venueId).first();
      if (!venue) {
        throw new Error('Venue not found');
      }

      if (venue.pricing_tier === 'standard') {
        throw new Error('Custom domains require white-label or enterprise tier');
      }

      // FIX: Count all domains that are not suspended (includes 'pending' and 'active')
      const existingDomains = await db('custom_domains')
        .where('venue_id', venueId)
        .whereNot('status', 'suspended')
        .count('* as count');

      const tierConfig = await db('white_label_pricing')
        .where('tier_name', venue.pricing_tier)
        .first();

      if (Number(existingDomains[0].count) >= tierConfig.max_custom_domains) {
        throw new Error(`Domain limit reached for ${venue.pricing_tier} tier`);
      }

      const existing = await db('custom_domains').where('domain', domain).first();
      if (existing) {
        throw new Error('Domain already registered');
      }

      const verificationToken = crypto.randomBytes(32).toString('hex');

      const requiredDnsRecords = {
        txt: {
          name: `_tickettoken-verify.${domain}`,
          value: verificationToken,
          ttl: 3600
        },
        cname: {
          name: domain,
          value: 'tickettoken.com',
          ttl: 3600
        }
      };

      const [customDomain] = await db('custom_domains')
        .insert({
          venue_id: venueId,
          domain,
          verification_token: verificationToken,
          verification_method: 'dns_txt',
          is_verified: false,
          ssl_status: 'pending',
          ssl_provider: 'letsencrypt',
          status: 'pending',
          required_dns_records: JSON.stringify(requiredDnsRecords)
        })
        .returning('*');

      logger.info('Custom domain added', { venueId, domain });
      return this.mapToDomainObject(customDomain);
    } catch (error) {
      logger.error('Error adding custom domain:', error);
      throw error;
    }
  }

  async verifyDomain(domainId: string, tenantId?: string): Promise<boolean> {
    try {
      const customDomain = await db('custom_domains').where('id', domainId).first();

      if (!customDomain) {
        throw new Error('Domain not found');
      }

      // Verify tenant ownership if tenantId provided
      if (tenantId) {
        this.validateTenantContext(tenantId);
        await this.verifyVenueOwnership(customDomain.venue_id, tenantId);
      }

      if (customDomain.is_verified) {
        return true;
      }

      const txtRecordName = `_tickettoken-verify.${customDomain.domain}`;

      try {
        // SECURITY FIX: Add timeout to DNS resolution
        const records = await this.withTimeout(
          dns.resolveTxt(txtRecordName),
          10000,
          'DNS lookup timeout'
        );
        const flatRecords = records.flat();

        const verified = flatRecords.some(record =>
          record === customDomain.verification_token
        );

        if (verified) {
          await db('custom_domains')
            .where('id', domainId)
            .update({
              is_verified: true,
              verified_at: new Date(),
              status: 'active',
              error_message: null,
              last_checked_at: new Date()
            });

          await db('venues')
            .where('id', customDomain.venue_id)
            .update({ custom_domain: customDomain.domain });

          await this.requestSSLCertificate(domainId);

          logger.info('Domain verified', { domainId, domain: customDomain.domain });
          return true;
        } else {
          await db('custom_domains')
            .where('id', domainId)
            .update({
              error_message: 'Verification TXT record not found',
              last_checked_at: new Date()
            });
          return false;
        }
      } catch (dnsError: any) {
        await db('custom_domains')
          .where('id', domainId)
          .update({
            error_message: `DNS lookup failed: ${dnsError.message}`,
            last_checked_at: new Date()
          });
        return false;
      }
    } catch (error) {
      logger.error('Error verifying domain:', error);
      throw error;
    }
  }

  private async requestSSLCertificate(domainId: string): Promise<void> {
    try {
      const customDomain = await db('custom_domains').where('id', domainId).first();

      const sslExpiresAt = new Date();
      sslExpiresAt.setDate(sslExpiresAt.getDate() + 90);

      await db('custom_domains')
        .where('id', domainId)
        .update({
          ssl_status: 'active',
          ssl_issued_at: new Date(),
          ssl_expires_at: sslExpiresAt
        });

      logger.info('SSL certificate requested', { domainId, domain: customDomain.domain });
    } catch (error) {
      logger.error('Error requesting SSL certificate:', error);

      await db('custom_domains')
        .where('id', domainId)
        .update({
          ssl_status: 'failed',
          ssl_error_message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
  }

  async getDomainStatus(domainId: string, tenantId?: string): Promise<CustomDomain> {
    const customDomain = await db('custom_domains').where('id', domainId).first();
    if (!customDomain) {
      throw new Error('Domain not found');
    }

    // Verify tenant ownership if tenantId provided
    if (tenantId) {
      this.validateTenantContext(tenantId);
      await this.verifyVenueOwnership(customDomain.venue_id, tenantId);
    }

    return this.mapToDomainObject(customDomain);
  }

  async getVenueDomains(venueId: string, tenantId?: string): Promise<CustomDomain[]> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId!);

    const domains = await db('custom_domains')
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc');
    return domains.map(d => this.mapToDomainObject(d));
  }

  async removeDomain(domainId: string, tenantId?: string): Promise<void> {
    const customDomain = await db('custom_domains').where('id', domainId).first();
    if (!customDomain) {
      throw new Error('Domain not found');
    }

    // Verify tenant ownership
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(customDomain.venue_id, tenantId!);

    await db('custom_domains')
      .where('id', domainId)
      .update({ status: 'suspended', updated_at: new Date() });

    await db('venues')
      .where('id', customDomain.venue_id)
      .where('custom_domain', customDomain.domain)
      .update({ custom_domain: null });

    logger.info('Domain removed', { domainId, domain: customDomain.domain });
  }

  private validateDomainFormat(domain: string): void {
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;

    if (!domainRegex.test(domain)) {
      throw new Error('Invalid domain format');
    }

    if (domain === 'tickettoken.com' || domain.endsWith('.tickettoken.com')) {
      throw new Error('Cannot use tickettoken.com domains');
    }
  }

  private mapToDomainObject(dbDomain: any): CustomDomain {
    return {
      id: dbDomain.id,
      venueId: dbDomain.venue_id,
      domain: dbDomain.domain,
      verificationToken: dbDomain.verification_token,
      verificationMethod: dbDomain.verification_method,
      isVerified: dbDomain.is_verified,
      verifiedAt: dbDomain.verified_at,
      sslStatus: dbDomain.ssl_status,
      sslProvider: dbDomain.ssl_provider,
      sslIssuedAt: dbDomain.ssl_issued_at,
      sslExpiresAt: dbDomain.ssl_expires_at,
      status: dbDomain.status,
      errorMessage: dbDomain.error_message
    };
  }
}

export const domainManagementService = new DomainManagementService();
