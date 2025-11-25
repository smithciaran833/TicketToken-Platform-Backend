import { logger } from '../utils/logger';
import { db } from '../config/database';
import axios from 'axios';

/**
 * Base adapter interface for verification services
 */
interface VerificationAdapter {
  verify(data: any): Promise<VerificationResult>;
  checkStatus(verificationId: string): Promise<VerificationStatus>;
}

interface VerificationResult {
  success: boolean;
  verificationId?: string;
  status: 'verified' | 'pending' | 'failed' | 'requires_manual_review';
  details?: any;
  error?: string;
}

interface VerificationStatus {
  status: 'verified' | 'pending' | 'failed' | 'requires_manual_review';
  completedAt?: Date;
  details?: any;
}

/**
 * Stripe Identity Adapter for identity verification
 * Documentation: https://stripe.com/docs/identity
 */
export class StripeIdentityAdapter implements VerificationAdapter {
  private client: any;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.STRIPE_SECRET_KEY || '';
    this.client = axios.create({
      baseURL: 'https://api.stripe.com/v1',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  async verify(data: { venueId: string; documentType: string; documentData: any }): Promise<VerificationResult> {
    try {
      // Create verification session
      const { venueId, documentType, documentData } = data;

      logger.info({ venueId, documentType }, 'Starting Stripe Identity verification');

      const response = await this.client.post('/identity/verification_sessions', new URLSearchParams({
        'type': 'document',
        'metadata[venue_id]': venueId,
        'metadata[document_type]': documentType,
      }));

      const session = response.data;

      // Store verification session reference
      await db('external_verifications').insert({
        venue_id: venueId,
        provider: 'stripe_identity',
        verification_type: 'identity',
        external_id: session.id,
        status: 'pending',
        created_at: new Date(),
      });

      return {
        success: true,
        verificationId: session.id,
        status: 'pending',
        details: {
          sessionUrl: session.url,
          clientSecret: session.client_secret,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Stripe Identity verification failed');
      
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async checkStatus(verificationId: string): Promise<VerificationStatus> {
    try {
      const response = await this.client.get(`/identity/verification_sessions/${verificationId}`);
      const session = response.data;

      return {
        status: this.mapStripeStatus(session.status),
        completedAt: session.last_verification_report?.verified_at 
          ? new Date(session.last_verification_report.verified_at * 1000) 
          : undefined,
        details: session.last_verification_report,
      };
    } catch (error: any) {
      logger.error({ error: error.message, verificationId }, 'Failed to check Stripe verification status');
      throw error;
    }
  }

  private mapStripeStatus(status: string): 'verified' | 'pending' | 'failed' | 'requires_manual_review' {
    const statusMap: Record<string, any> = {
      'verified': 'verified',
      'requires_input': 'pending',
      'processing': 'pending',
      'canceled': 'failed',
    };
    return statusMap[status] || 'requires_manual_review';
  }
}

/**
 * Plaid Adapter for bank account verification
 * Documentation: https://plaid.com/docs/
 */
export class PlaidAdapter implements VerificationAdapter {
  private client: any;
  private clientId: string;
  private secret: string;
  private environment: string;

 constructor() {
    this.clientId = process.env.PLAID_CLIENT_ID || '';
    this.secret = process.env.PLAID_SECRET || '';
    this.environment = process.env.PLAID_ENV || 'sandbox';
    
    const baseURL = this.environment === 'production' 
      ? 'https://production.plaid.com'
      : 'https://sandbox.plaid.com';

    this.client = axios.create({
      baseURL,
      headers: {
        'PLAID-CLIENT-ID': this.clientId,
        'PLAID-SECRET': this.secret,
        'Content-Type': 'application/json',
      },
    });
  }

  async verify(data: { venueId: string; accountData: any }): Promise<VerificationResult> {
    try {
      const { venueId, accountData } = data;

      logger.info({ venueId }, 'Starting Plaid bank verification');

      // Create link token for bank connection
      const linkTokenResponse = await this.client.post('/link/token/create', {
        user: { client_user_id: venueId },
        client_name: 'TicketToken Venue Platform',
        products: ['auth', 'identity'],
        country_codes: ['US'],
        language: 'en',
        webhook: `${process.env.API_BASE_URL}/webhooks/plaid`,
      });

      const linkToken = linkTokenResponse.data.link_token;

      // Store verification reference
      await db('external_verifications').insert({
        venue_id: venueId,
        provider: 'plaid',
        verification_type: 'bank_account',
        external_id: linkToken,
        status: 'pending',
        created_at: new Date(),
      });

      return {
        success: true,
        verificationId: linkToken,
        status: 'pending',
        details: {
          linkToken,
          expiresAt: linkTokenResponse.data.expiration,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Plaid bank verification failed');
      
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async checkStatus(verificationId: string): Promise<VerificationStatus> {
    try {
      // In real implementation, would check access token status
      const verification = await db('external_verifications')
        .where({ external_id: verificationId })
        .first();

      if (!verification) {
        throw new Error('Verification not found');
      }

      return {
        status: verification.status,
        completedAt: verification.completed_at,
        details: verification.metadata,
      };
    } catch (error: any) {
      logger.error({ error: error.message, verificationId }, 'Failed to check Plaid verification status');
      throw error;
    }
  }

  async exchangePublicToken(publicToken: string, venueId: string): Promise<void> {
    try {
      // Exchange public token for access token
      const response = await this.client.post('/item/public_token/exchange', {
        public_token: publicToken,
      });

      const accessToken = response.data.access_token;

      // Get account details
      const authResponse = await this.client.post('/auth/get', {
        access_token: accessToken,
      });

      // Update verification status
      await db('external_verifications')
        .where({ venue_id: venueId, provider: 'plaid', status: 'pending' })
        .update({
          status: 'verified',
          completed_at: new Date(),
          metadata: {
            accounts: authResponse.data.accounts,
            numbers: authResponse.data.numbers,
          },
        });

      logger.info({ venueId }, 'Plaid bank account verified successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId }, 'Failed to exchange Plaid public token');
      throw error;
    }
  }
}

/**
 * Tax ID Verification Adapter
 * Uses IRS TIN Matching API or similar service
 */
export class TaxVerificationAdapter implements VerificationAdapter {
  async verify(data: { venueId: string; taxId: string; businessName: string }): Promise<VerificationResult> {
    try {
      const { venueId, taxId, businessName } = data;

      logger.info({ venueId }, 'Starting tax ID verification');

      // In production, would integrate with IRS TIN Matching API
      // For now, implement basic validation
      const isValid = this.validateTaxIdFormat(taxId);

      if (!isValid) {
        return {
          success: false,
          status: 'failed',
          error: 'Invalid tax ID format',
        };
      }

      // Store verification attempt
      const verification = await db('external_verifications').insert({
        venue_id: venueId,
        provider: 'tax_verification',
        verification_type: 'tax_id',
        external_id: `tax_verify_${Date.now()}`,
        status: 'requires_manual_review', // Always require manual review for tax IDs
        metadata: {
          taxId: this.maskTaxId(taxId),
          businessName,
        },
        created_at: new Date(),
      }).returning('*');

      // Trigger manual review workflow
      await this.queueManualReview(venueId, verification[0].id);

      return {
        success: true,
        verificationId: verification[0].id,
        status: 'requires_manual_review',
        details: {
          message: 'Tax ID submitted for manual verification',
          estimatedReviewTime: '1-2 business days',
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Tax ID verification failed');
      
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async checkStatus(verificationId: string): Promise<VerificationStatus> {
    const verification = await db('external_verifications')
      .where({ id: verificationId })
      .first();

    if (!verification) {
      throw new Error('Verification not found');
    }

    return {
      status: verification.status,
      completedAt: verification.completed_at,
      details: verification.metadata,
    };
  }

  private validateTaxIdFormat(taxId: string): boolean {
    // EIN format: XX-XXXXXXX
    const einRegex = /^\d{2}-\d{7}$/;
    // SSN format: XXX-XX-XXXX (for sole proprietors)
    const ssnRegex = /^\d{3}-\d{2}-\d{4}$/;
    
    const cleanedTaxId = taxId.replace(/\s/g, '');
    return einRegex.test(cleanedTaxId) || ssnRegex.test(cleanedTaxId);
  }

  private maskTaxId(taxId: string): string {
    // Mask all but last 4 digits
    return taxId.replace(/\d(?=\d{4})/g, '*');
  }

  private async queueManualReview(venueId: string, verificationId: string): Promise<void> {
    await db('manual_review_queue').insert({
      venue_id: venueId,
      verification_id: verificationId,
      review_type: 'tax_id',
      priority: 'high',
      status: 'pending',
      created_at: new Date(),
    });

    logger.info({ venueId, verificationId }, 'Tax ID queued for manual review');
  }
}

/**
 * Business Verification Adapter
 * Verifies business information against public records
 */
export class BusinessVerificationAdapter implements VerificationAdapter {
  async verify(data: { venueId: string; businessInfo: any }): Promise<VerificationResult> {
    try {
      const { venueId, businessInfo } = data;

      logger.info({ venueId }, 'Starting business verification');

      // Basic validation
      const requiredFields = ['businessName', 'address', 'businessType'];
      const missingFields = requiredFields.filter(field => !businessInfo[field]);

      if (missingFields.length > 0) {
        return {
          success: false,
          status: 'failed',
          error: `Missing required fields: ${missingFields.join(', ')}`,
        };
      }

      // In production, would integrate with:
      // - Secretary of State API
      // - D&B Business Directory
      // - OpenCorporates API
      
      // For now, queue for manual review
      const verification = await db('external_verifications').insert({
        venue_id: venueId,
        provider: 'business_verification',
        verification_type: 'business_info',
        external_id: `bus_verify_${Date.now()}`,
        status: 'requires_manual_review',
        metadata: businessInfo,
        created_at: new Date(),
      }).returning('*');

      await this.queueManualReview(venueId, verification[0].id);

      return {
        success: true,
        verificationId: verification[0].id,
        status: 'requires_manual_review',
        details: {
          message: 'Business information submitted for verification',
          estimatedReviewTime: '2-3 business days',
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Business verification failed');
      
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async checkStatus(verificationId: string): Promise<VerificationStatus> {
    const verification = await db('external_verifications')
      .where({ id: verificationId })
      .first();

    if (!verification) {
      throw new Error('Verification not found');
    }

    return {
      status: verification.status,
      completedAt: verification.completed_at,
      details: verification.metadata,
    };
  }

  private async queueManualReview(venueId: string, verificationId: string): Promise<void> {
    await db('manual_review_queue').insert({
      venue_id: venueId,
      verification_id: verificationId,
      review_type: 'business_info',
      priority: 'medium',
      status: 'pending',
      created_at: new Date(),
    });

    logger.info({ venueId, verificationId }, 'Business info queued for manual review');
  }
}

/**
 * Verification Adapter Factory
 * Creates appropriate adapter based on verification type
 */
export class VerificationAdapterFactory {
  static create(verificationType: 'identity' | 'bank_account' | 'tax_id' | 'business_info'): VerificationAdapter {
    switch (verificationType) {
      case 'identity':
        return new StripeIdentityAdapter();
      case 'bank_account':
        return new PlaidAdapter();
      case 'tax_id':
        return new TaxVerificationAdapter();
      case 'business_info':
        return new BusinessVerificationAdapter();
      default:
        throw new Error(`Unknown verification type: ${verificationType}`);
    }
  }

  static isConfigured(verificationType: string): boolean {
    const configChecks: Record<string, () => boolean> = {
      identity: () => !!process.env.STRIPE_SECRET_KEY,
      bank_account: () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      tax_id: () => true, // Always available (uses manual review)
      business_info: () => true, // Always available (uses manual review)
    };

    return configChecks[verificationType]?.() || false;
  }
}
