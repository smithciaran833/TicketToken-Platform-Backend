import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface VerificationResult {
  verified: boolean;
  checks: {
    businessInfo: boolean;
    taxInfo: boolean;
    bankAccount: boolean;
    identity: boolean;
  };
  issues: string[];
  verifiedAt?: Date;
}

/**
 * SECURITY FIX (TENANT1): Verification service with tenant isolation
 * ALL methods now require tenantId - no optional parameters
 */
export class VerificationService {
  /**
   * SECURITY FIX: Validate tenant context
   */
  private validateTenantContext(tenantId: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for verification operations');
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
      .whereNull('deleted_at')
      .first();

    if (!venue) {
      logger.warn({ venueId, tenantId }, 'Venue ownership verification failed');
      throw new Error('Venue not found or access denied');
    }
  }

  async verifyVenue(venueId: string, tenantId: string): Promise<VerificationResult> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    const venue = await db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .first();
      
    if (!venue) {
      throw new Error('Venue not found');
    }

    const result: VerificationResult = {
      verified: false,
      checks: {
        businessInfo: false,
        taxInfo: false,
        bankAccount: false,
        identity: false,
      },
      issues: [],
    };

    // Check business information
    result.checks.businessInfo = await this.verifyBusinessInfo(venue);
    if (!result.checks.businessInfo) {
      result.issues.push('Incomplete business information');
    }

    // Check tax information - SECURITY FIX: tenantId now required
    result.checks.taxInfo = await this.verifyTaxInfo(venueId, tenantId);
    if (!result.checks.taxInfo) {
      result.issues.push('Tax information not provided');
    }

    // Check bank account - SECURITY FIX: tenantId now required
    result.checks.bankAccount = await this.verifyBankAccount(venueId, tenantId);
    if (!result.checks.bankAccount) {
      result.issues.push('Bank account not verified');
    }

    // Check identity verification - SECURITY FIX: tenantId now required
    result.checks.identity = await this.verifyIdentity(venueId, tenantId);
    if (!result.checks.identity) {
      result.issues.push('Identity verification pending');
    }

    // All checks passed?
    result.verified = Object.values(result.checks).every(check => check);

    if (result.verified) {
      result.verifiedAt = new Date();
      await this.markVenueVerified(venueId, tenantId);
    }

    logger.info({ venueId, tenantId, result }, 'Venue verification completed');

    return result;
  }

  async submitDocument(
    venueId: string,
    tenantId: string,
    documentType: string,
    documentData: any
  ): Promise<{ documentId: string; status: string }> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    // SECURITY FIX: Store document reference with tenant_id
    const [document] = await db('venue_documents').insert({
      venue_id: venueId,
      tenant_id: tenantId,
      document_type: documentType,
      file_url: documentData.fileUrl || 'placeholder.pdf',
      file_name: documentData.fileName || null,
      mime_type: documentData.mimeType || null,
      file_size: documentData.fileSize || null,
      status: 'pending',
      submitted_at: new Date(),
      metadata: JSON.stringify(documentData.metadata || {}),
      created_at: new Date(),
      updated_at: new Date(),
    }).returning(['id', 'status']);

    // Trigger verification based on document type
    switch (documentType) {
      case 'business_license':
      case 'articles_of_incorporation':
        await this.triggerBusinessVerification(venueId, tenantId);
        break;
      case 'tax_id':
      case 'w9':
        await this.triggerTaxVerification(venueId, tenantId);
        break;
      case 'bank_statement':
      case 'voided_check':
        await this.triggerBankVerification(venueId, tenantId);
        break;
      case 'drivers_license':
      case 'passport':
        await this.triggerIdentityVerification(venueId, tenantId);
        break;
    }

    logger.info({ venueId, tenantId, documentType, documentId: document.id }, 'Document submitted for verification');

    return {
      documentId: document.id,
      status: document.status,
    };
  }

  async getVerificationStatus(venueId: string, tenantId: string): Promise<{
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    completedChecks: string[];
    pendingChecks: string[];
    requiredDocuments: string[];
  }> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    const verification = await this.verifyVenue(venueId, tenantId);
    
    // SECURITY FIX: Always filter by tenant_id
    const documents = await db('venue_documents')
      .where({ venue_id: venueId, tenant_id: tenantId })
      .select('document_type', 'status');

    const completedChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => passed)
      .map(([check]) => check);

    const pendingChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => !passed)
      .map(([check]) => check);

    const requiredDocuments = this.getRequiredDocuments(pendingChecks);

    let status: 'unverified' | 'pending' | 'verified' | 'rejected' = 'unverified';
    if (verification.verified) {
      status = 'verified';
    } else if (documents.some((d: any) => d.status === 'pending')) {
      status = 'pending';
    } else if (documents.some((d: any) => d.status === 'rejected')) {
      status = 'rejected';
    }

    return {
      status,
      completedChecks,
      pendingChecks,
      requiredDocuments,
    };
  }

  /**
   * Get all external verifications for a venue
   */
  async getExternalVerifications(venueId: string, tenantId: string): Promise<any[]> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    return db('external_verifications')
      .where({ venue_id: venueId, tenant_id: tenantId })
      .orderBy('created_at', 'desc');
  }

  /**
   * Get manual review queue items for a venue
   */
  async getManualReviewItems(venueId: string, tenantId: string): Promise<any[]> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    return db('manual_review_queue')
      .where({ venue_id: venueId, tenant_id: tenantId })
      .orderBy('created_at', 'desc');
  }

  /**
   * Start identity verification via Stripe Identity
   */
  async startIdentityVerification(venueId: string, tenantId: string): Promise<{
    verificationId: string;
    sessionUrl?: string;
    status: string;
  }> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');

      if (!VerificationAdapterFactory.isConfigured('identity')) {
        logger.warn({ venueId, tenantId }, 'Identity verification not configured, using manual fallback');
        const manualId = await this.triggerManualVerification(venueId, tenantId, 'identity');
        return {
          verificationId: manualId,
          status: 'pending_manual_review',
        };
      }

      const adapter = VerificationAdapterFactory.create('identity');
      const result = await adapter.verify({
        venueId,
        tenantId,
        documentType: 'identity',
        documentData: {},
      });

      return {
        verificationId: result.verificationId || '',
        sessionUrl: result.details?.sessionUrl,
        status: result.status,
      };
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to start identity verification');
      const manualId = await this.triggerManualVerification(venueId, tenantId, 'identity');
      return {
        verificationId: manualId,
        status: 'pending_manual_review',
      };
    }
  }

  /**
   * Start bank verification via Plaid
   */
  async startBankVerification(venueId: string, tenantId: string): Promise<{
    verificationId: string;
    linkToken?: string;
    status: string;
  }> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');

      if (!VerificationAdapterFactory.isConfigured('bank_account')) {
        logger.warn({ venueId, tenantId }, 'Bank verification not configured, using manual fallback');
        const manualId = await this.triggerManualVerification(venueId, tenantId, 'bank_account');
        return {
          verificationId: manualId,
          status: 'pending_manual_review',
        };
      }

      const adapter = VerificationAdapterFactory.create('bank_account');
      const result = await adapter.verify({
        venueId,
        tenantId,
        accountData: {},
      });

      return {
        verificationId: result.verificationId || '',
        linkToken: result.details?.linkToken,
        status: result.status,
      };
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to start bank verification');
      const manualId = await this.triggerManualVerification(venueId, tenantId, 'bank_account');
      return {
        verificationId: manualId,
        status: 'pending_manual_review',
      };
    }
  }

  /**
   * Complete Plaid bank verification with public token
   */
  async completeBankVerification(
    venueId: string,
    tenantId: string,
    publicToken: string
  ): Promise<{ success: boolean; status: string }> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    try {
      const { PlaidAdapter } = await import('../integrations/verification-adapters');
      const adapter = new PlaidAdapter();
      
      // SECURITY FIX: Pass tenantId to exchangePublicToken
      await adapter.exchangePublicToken(publicToken, venueId, tenantId);

      return {
        success: true,
        status: 'verified',
      };
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to complete bank verification');
      return {
        success: false,
        status: 'failed',
      };
    }
  }

  /**
   * Check verification status from external provider
   */
  async checkExternalVerificationStatus(
    venueId: string,
    tenantId: string,
    verificationId: string
  ): Promise<{ status: string; details?: any }> {
    this.validateTenantContext(tenantId);
    await this.verifyVenueOwnership(venueId, tenantId);

    // Get the verification record
    const verification = await db('external_verifications')
      .where({ 
        id: verificationId, 
        venue_id: venueId, 
        tenant_id: tenantId 
      })
      .first();

    if (!verification) {
      throw new Error('Verification not found');
    }

    // If already completed, return cached status
    if (verification.status === 'verified' || verification.status === 'failed') {
      return {
        status: verification.status,
        details: verification.metadata,
      };
    }

    // Check with external provider
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');
      const adapter = VerificationAdapterFactory.create(verification.verification_type);
      const result = await adapter.checkStatus(verification.external_id);

      // Update local status
      await db('external_verifications')
        .where({ id: verificationId, tenant_id: tenantId })
        .update({
          status: result.status,
          completed_at: result.completedAt,
          metadata: JSON.stringify(result.details || {}),
          updated_at: new Date(),
        });

      return {
        status: result.status,
        details: result.details,
      };
    } catch (error: any) {
      logger.error({ error: error.message, verificationId }, 'Failed to check verification status');
      return {
        status: verification.status,
        details: verification.metadata,
      };
    }
  }

  // ============================================================================
  // PRIVATE METHODS - ALL NOW REQUIRE tenantId (no optional params)
  // ============================================================================

  private async verifyBusinessInfo(venue: any): Promise<boolean> {
    // Check if required business fields are present
    return !!(
      venue.name &&
      venue.address_line1 &&
      venue.venue_type &&
      venue.max_capacity
    );
  }

  /**
   * SECURITY FIX: tenantId is now REQUIRED (was optional)
   */
  private async verifyTaxInfo(venueId: string, tenantId: string): Promise<boolean> {
    // SECURITY FIX: Always filter by tenant_id
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, tenant_id: tenantId, status: 'approved' })
      .whereIn('document_type', ['tax_id', 'w9'])
      .first();

    return !!taxDocs;
  }

  /**
   * SECURITY FIX: tenantId is now REQUIRED (was optional)
   */
  private async verifyBankAccount(venueId: string, tenantId: string): Promise<boolean> {
    // Check for verified payment integration
    // SECURITY FIX: Always filter by tenant_id
    const paymentIntegration = await db('venue_integrations')
      .where({ venue_id: venueId, tenant_id: tenantId, is_active: true })
      .whereIn('integration_type', ['stripe', 'square'])
      .first();

    if (paymentIntegration) {
      return true;
    }

    // Also check external_verifications for Plaid verification
    const plaidVerification = await db('external_verifications')
      .where({ 
        venue_id: venueId, 
        tenant_id: tenantId, 
        provider: 'plaid', 
        status: 'verified' 
      })
      .first();

    return !!plaidVerification;
  }

  /**
   * SECURITY FIX: tenantId is now REQUIRED (was optional)
   */
  private async verifyIdentity(venueId: string, tenantId: string): Promise<boolean> {
    // Check for approved identity documents
    // SECURITY FIX: Always filter by tenant_id
    const identityDocs = await db('venue_documents')
      .where({ venue_id: venueId, tenant_id: tenantId, status: 'approved' })
      .whereIn('document_type', ['drivers_license', 'passport'])
      .first();

    if (identityDocs) {
      return true;
    }

    // Also check external_verifications for Stripe Identity
    const stripeIdentity = await db('external_verifications')
      .where({ 
        venue_id: venueId, 
        tenant_id: tenantId, 
        provider: 'stripe_identity', 
        status: 'verified' 
      })
      .first();

    return !!stripeIdentity;
  }

  /**
   * SECURITY FIX: tenantId is now REQUIRED (was optional)
   */
  private async markVenueVerified(venueId: string, tenantId: string): Promise<void> {
    // SECURITY FIX: Always filter by tenant_id
    await db('venues')
      .where({ id: venueId, tenant_id: tenantId })
      .update({
        is_verified: true,
        verified_at: new Date(),
        updated_at: new Date(),
      });

    logger.info({ venueId, tenantId }, 'Venue marked as verified');
  }

  private getRequiredDocuments(pendingChecks: string[]): string[] {
    const documentMap: Record<string, string[]> = {
      businessInfo: ['business_license', 'articles_of_incorporation'],
      taxInfo: ['tax_id', 'w9'],
      bankAccount: ['bank_statement', 'voided_check'],
      identity: ['drivers_license', 'passport'],
    };

    return pendingChecks.flatMap(check => documentMap[check] || []);
  }

  private async triggerBusinessVerification(venueId: string, tenantId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');

      if (!VerificationAdapterFactory.isConfigured('business_info')) {
        logger.warn({ venueId, tenantId }, 'Business verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, tenantId, 'business_info');
        return;
      }

      const adapter = VerificationAdapterFactory.create('business_info');
      const venue = await db('venues')
        .where({ id: venueId, tenant_id: tenantId })
        .first();

      const result = await adapter.verify({
        venueId,
        tenantId,
        businessInfo: {
          businessName: venue.name,
          address: venue.address_line1,
          businessType: venue.venue_type,
        },
      });

      logger.info({ venueId, tenantId, result }, 'Business verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to trigger business verification');
      await this.triggerManualVerification(venueId, tenantId, 'business_info');
    }
  }

  private async triggerTaxVerification(venueId: string, tenantId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');

      if (!VerificationAdapterFactory.isConfigured('tax_id')) {
        logger.warn({ venueId, tenantId }, 'Tax verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, tenantId, 'tax_id');
        return;
      }

      const adapter = VerificationAdapterFactory.create('tax_id');
      const taxDoc = await db('venue_documents')
        .where({ venue_id: venueId, tenant_id: tenantId, document_type: 'tax_id' })
        .orderBy('created_at', 'desc')
        .first();

      if (!taxDoc) {
        logger.warn({ venueId, tenantId }, 'No tax document found for verification');
        return;
      }

      const metadata = typeof taxDoc.metadata === 'string' 
        ? JSON.parse(taxDoc.metadata) 
        : taxDoc.metadata || {};

      const result = await adapter.verify({
        venueId,
        tenantId,
        taxId: metadata.taxId || '',
        businessName: metadata.businessName || '',
      });

      logger.info({ venueId, tenantId, result }, 'Tax verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to trigger tax verification');
      await this.triggerManualVerification(venueId, tenantId, 'tax_id');
    }
  }

  private async triggerBankVerification(venueId: string, tenantId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');

      if (!VerificationAdapterFactory.isConfigured('bank_account')) {
        logger.warn({ venueId, tenantId }, 'Bank verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, tenantId, 'bank_account');
        return;
      }

      const adapter = VerificationAdapterFactory.create('bank_account');
      const bankDoc = await db('venue_documents')
        .where({ venue_id: venueId, tenant_id: tenantId })
        .whereIn('document_type', ['bank_statement', 'voided_check'])
        .orderBy('created_at', 'desc')
        .first();

      const metadata = bankDoc 
        ? (typeof bankDoc.metadata === 'string' ? JSON.parse(bankDoc.metadata) : bankDoc.metadata || {})
        : {};

      const result = await adapter.verify({
        venueId,
        tenantId,
        accountData: metadata,
      });

      logger.info({ venueId, tenantId, result }, 'Bank verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to trigger bank verification');
      await this.triggerManualVerification(venueId, tenantId, 'bank_account');
    }
  }

  private async triggerIdentityVerification(venueId: string, tenantId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');

      if (!VerificationAdapterFactory.isConfigured('identity')) {
        logger.warn({ venueId, tenantId }, 'Identity verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, tenantId, 'identity');
        return;
      }

      const adapter = VerificationAdapterFactory.create('identity');
      const identityDoc = await db('venue_documents')
        .where({ venue_id: venueId, tenant_id: tenantId })
        .whereIn('document_type', ['drivers_license', 'passport'])
        .orderBy('created_at', 'desc')
        .first();

      if (!identityDoc) {
        logger.warn({ venueId, tenantId }, 'No identity document found for verification');
        return;
      }

      const metadata = typeof identityDoc.metadata === 'string'
        ? JSON.parse(identityDoc.metadata)
        : identityDoc.metadata || {};

      const result = await adapter.verify({
        venueId,
        tenantId,
        documentType: identityDoc.document_type,
        documentData: metadata,
      });

      logger.info({ venueId, tenantId, result }, 'Identity verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId }, 'Failed to trigger identity verification');
      await this.triggerManualVerification(venueId, tenantId, 'identity');
    }
  }

  /**
   * Manual fallback verification workflow
   * Used when external verification services are unavailable or not configured
   * Returns the manual review queue item ID
   */
  private async triggerManualVerification(
    venueId: string,
    tenantId: string,
    verificationType: string
  ): Promise<string> {
    try {
      // SECURITY FIX: Create manual review task with tenant_id
      const [manualReview] = await db('manual_review_queue').insert({
        venue_id: venueId,
        tenant_id: tenantId,
        verification_id: null,
        review_type: verificationType,
        priority: this.getManualReviewPriority(verificationType),
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        metadata: JSON.stringify({
          reason: 'external_service_unavailable',
          automaticVerificationAttempted: true,
        }),
      }).returning('id');

      // Update document status to pending manual review
      await db('venue_documents')
        .where({ venue_id: venueId, tenant_id: tenantId })
        .whereIn('document_type', this.getDocumentTypesForVerification(verificationType))
        .update({
          status: 'pending_manual_review',
          updated_at: new Date(),
        });

      logger.info({ venueId, tenantId, verificationType, manualReviewId: manualReview.id }, 'Manual verification workflow triggered');

      return manualReview.id;
    } catch (error: any) {
      logger.error({ error: error.message, venueId, tenantId, verificationType }, 'Failed to trigger manual verification');
      throw error;
    }
  }

  private getManualReviewPriority(verificationType: string): string {
    const priorities: Record<string, string> = {
      identity: 'high',
      tax_id: 'high',
      bank_account: 'medium',
      business_info: 'medium',
    };
    return priorities[verificationType] || 'low';
  }

  private getDocumentTypesForVerification(verificationType: string): string[] {
    const typeMap: Record<string, string[]> = {
      identity: ['drivers_license', 'passport'],
      tax_id: ['tax_id', 'w9'],
      bank_account: ['bank_statement', 'voided_check'],
      business_info: ['business_license', 'articles_of_incorporation'],
    };
    return typeMap[verificationType] || [];
  }
}
