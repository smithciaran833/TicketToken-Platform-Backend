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
      venue.type &&
      venue.capacity
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
    // TODO: Integrate with verification service
    logger.info({ venueId }, 'Business verification triggered');
  }

  private async triggerTaxVerification(venueId: string): Promise<void> {
    // TODO: Integrate with tax verification service
    logger.info({ venueId }, 'Tax verification triggered');
  }

  private async triggerBankVerification(venueId: string): Promise<void> {
    // TODO: Integrate with bank verification service
    logger.info({ venueId }, 'Bank verification triggered');
  }

  private async triggerIdentityVerification(venueId: string): Promise<void> {
    // TODO: Integrate with identity verification service
    logger.info({ venueId }, 'Identity verification triggered');
  }
}
