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

export class VerificationService {
  async verifyVenue(venueId: string): Promise<VerificationResult> {
    const venue = await db('venues').where({ id: venueId }).first();
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

    // Check tax information
    result.checks.taxInfo = await this.verifyTaxInfo(venueId);
    if (!result.checks.taxInfo) {
      result.issues.push('Tax information not provided');
    }

    // Check bank account
    result.checks.bankAccount = await this.verifyBankAccount(venueId);
    if (!result.checks.bankAccount) {
      result.issues.push('Bank account not verified');
    }

    // Check identity verification
    result.checks.identity = await this.verifyIdentity(venueId);
    if (!result.checks.identity) {
      result.issues.push('Identity verification pending');
    }

    // All checks passed?
    result.verified = Object.values(result.checks).every(check => check);

    if (result.verified) {
      result.verifiedAt = new Date();
      await this.markVenueVerified(venueId);
    }

    logger.info({ venueId, result }, 'Venue verification completed');

    return result;
  }

  async submitDocument(venueId: string, documentType: string, documentData: any): Promise<void> {
    // Store document reference
    await db('venue_documents').insert({
      venue_id: venueId,
      type: documentType,
      status: 'pending',
      submitted_at: new Date(),
      metadata: documentData,
    });

    // Trigger verification based on document type
    switch (documentType) {
      case 'business_license':
      case 'articles_of_incorporation':
        await this.triggerBusinessVerification(venueId);
        break;
      case 'tax_id':
      case 'w9':
        await this.triggerTaxVerification(venueId);
        break;
      case 'bank_statement':
      case 'voided_check':
        await this.triggerBankVerification(venueId);
        break;
      case 'drivers_license':
      case 'passport':
        await this.triggerIdentityVerification(venueId);
        break;
    }

    logger.info({ venueId, documentType }, 'Document submitted for verification');
  }

  async getVerificationStatus(venueId: string): Promise<{
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    completedChecks: string[];
    pendingChecks: string[];
    requiredDocuments: string[];
  }> {
    const verification = await this.verifyVenue(venueId);
    const documents = await db('venue_documents')
      .where({ venue_id: venueId })
      .select('type', 'status');

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

  private async verifyBusinessInfo(venue: any): Promise<boolean> {
    // Check if required business fields are present
    return !!(
      venue.name &&
      venue.address &&
      venue.venue_type &&
      venue.max_capacity
    );
  }

  private async verifyTaxInfo(venueId: string): Promise<boolean> {
    // Check for tax documents
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, type: 'tax_id', status: 'approved' })
      .orWhere({ venue_id: venueId, type: 'w9', status: 'approved' })
      .first();

    return !!taxDocs;
  }

  private async verifyBankAccount(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const paymentIntegration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();

    return !!paymentIntegration;
  }

  private async verifyIdentity(venueId: string): Promise<boolean> {
    // Check for identity documents
    const identityDocs = await db('venue_documents')
      .where({ venue_id: venueId, status: 'approved' })
      .whereIn('type', ['drivers_license', 'passport'])
      .first();

    return !!identityDocs;
  }

  private async markVenueVerified(venueId: string): Promise<void> {
    await db('venues')
      .where({ id: venueId })
      .update({
        settings: db.raw("settings || ?::jsonb", JSON.stringify({
          verification: {
            verified: true,
            verifiedAt: new Date(),
          },
        })),
        updated_at: new Date(),
      });
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

  private async triggerBusinessVerification(venueId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');
      
      if (!VerificationAdapterFactory.isConfigured('business_info')) {
        logger.warn({ venueId }, 'Business verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, 'business_info');
        return;
      }

      const adapter = VerificationAdapterFactory.create('business_info');
      const venue = await db('venues').where({ id: venueId }).first();
      
      const result = await adapter.verify({
        venueId,
        businessInfo: {
          businessName: venue.name,
          address: venue.address,
          businessType: venue.venue_type,
        },
      });

      logger.info({ venueId, result }, 'Business verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId }, 'Failed to trigger business verification');
      // Fallback to manual verification
      await this.triggerManualVerification(venueId, 'business_info');
    }
  }

  private async triggerTaxVerification(venueId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');
      
      if (!VerificationAdapterFactory.isConfigured('tax_id')) {
        logger.warn({ venueId }, 'Tax verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, 'tax_id');
        return;
      }

      const adapter = VerificationAdapterFactory.create('tax_id');
      const taxDoc = await db('venue_documents')
        .where({ venue_id: venueId, type: 'tax_id' })
        .orderBy('created_at', 'desc')
        .first();
      
      if (!taxDoc) {
        logger.warn({ venueId }, 'No tax document found for verification');
        return;
      }

      const result = await adapter.verify({
        venueId,
        taxId: taxDoc.metadata?.taxId || '',
        businessName: taxDoc.metadata?.businessName || '',
      });

      logger.info({ venueId, result }, 'Tax verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId }, 'Failed to trigger tax verification');
      await this.triggerManualVerification(venueId, 'tax_id');
    }
  }

  private async triggerBankVerification(venueId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');
      
      if (!VerificationAdapterFactory.isConfigured('bank_account')) {
        logger.warn({ venueId }, 'Bank verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, 'bank_account');
        return;
      }

      const adapter = VerificationAdapterFactory.create('bank_account');
      const bankDoc = await db('venue_documents')
        .where({ venue_id: venueId })
        .whereIn('type', ['bank_statement', 'voided_check'])
        .orderBy('created_at', 'desc')
        .first();
      
      const result = await adapter.verify({
        venueId,
        accountData: bankDoc?.metadata || {},
      });

      logger.info({ venueId, result }, 'Bank verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId }, 'Failed to trigger bank verification');
      await this.triggerManualVerification(venueId, 'bank_account');
    }
  }

  private async triggerIdentityVerification(venueId: string): Promise<void> {
    try {
      const { VerificationAdapterFactory } = await import('../integrations/verification-adapters');
      
      if (!VerificationAdapterFactory.isConfigured('identity')) {
        logger.warn({ venueId }, 'Identity verification not configured, using manual fallback');
        await this.triggerManualVerification(venueId, 'identity');
        return;
      }

      const adapter = VerificationAdapterFactory.create('identity');
      const identityDoc = await db('venue_documents')
        .where({ venue_id: venueId })
        .whereIn('type', ['drivers_license', 'passport'])
        .orderBy('created_at', 'desc')
        .first();
      
      if (!identityDoc) {
        logger.warn({ venueId }, 'No identity document found for verification');
        return;
      }

      const result = await adapter.verify({
        venueId,
        documentType: identityDoc.type,
        documentData: identityDoc.metadata || {},
      });

      logger.info({ venueId, result }, 'Identity verification triggered successfully');
    } catch (error: any) {
      logger.error({ error: error.message, venueId }, 'Failed to trigger identity verification');
      await this.triggerManualVerification(venueId, 'identity');
    }
  }

  /**
   * Manual fallback verification workflow
   * Used when external verification services are unavailable or not configured
   */
  private async triggerManualVerification(
    venueId: string, 
    verificationType: string
  ): Promise<void> {
    try {
      // Create manual review task
      await db('manual_review_queue').insert({
        venue_id: venueId,
        verification_id: null,
        review_type: verificationType,
        priority: this.getManualReviewPriority(verificationType),
        status: 'pending',
        created_at: new Date(),
        metadata: {
          reason: 'external_service_unavailable',
          automaticVerificationAttempted: true,
        },
      });

      // Update document status to pending manual review
      await db('venue_documents')
        .where({ venue_id: venueId })
        .whereIn('type', this.getDocumentTypesForVerification(verificationType))
        .update({
          status: 'pending_manual_review',
          updated_at: new Date(),
        });

      logger.info({ venueId, verificationType }, 'Manual verification workflow triggered');
    } catch (error: any) {
      logger.error({ error: error.message, venueId, verificationType }, 'Failed to trigger manual verification');
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
