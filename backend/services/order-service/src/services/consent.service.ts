/**
 * Consent Management Service
 * 
 * Implements GDPR Article 6 - Lawfulness of Processing
 * Manages user consent for various data processing purposes
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  ConsentRecord,
  ConsentPurpose,
  ConsentStatus,
  UpdateConsentDto,
  IConsentService,
} from '../types/privacy.types';
import { logger } from '../utils/logger';

export class ConsentService implements IConsentService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get consent for a specific purpose
   */
  async getConsent(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM consent_records 
       WHERE user_id = $1 AND purpose = $2 
       ORDER BY version DESC 
       LIMIT 1`,
      [userId, purpose]
    );

    return result.rows.length > 0 ? (result.rows[0] as ConsentRecord) : null;
  }

  /**
   * Get all consents for a user
   */
  async getAllConsents(userId: string, tenantId: string): Promise<ConsentRecord[]> {
    // Get latest version of each consent purpose
    const result = await this.pool.query(
      `SELECT DISTINCT ON (purpose) * 
       FROM consent_records 
       WHERE user_id = $1 AND tenant_id = $2 
       ORDER BY purpose, version DESC`,
      [userId, tenantId]
    );

    return result.rows as ConsentRecord[];
  }

  /**
   * Update consent (grant or deny)
   */
  async updateConsent(
    userId: string,
    tenantId: string,
    dto: UpdateConsentDto
  ): Promise<ConsentRecord> {
    // Get existing consent
    const existing = await this.getConsent(userId, dto.purpose);

    const newStatus = dto.granted ? ConsentStatus.GRANTED : ConsentStatus.DENIED;
    const timestamp = new Date();
    const id = uuidv4();
    const version = dto.version || (existing?.version || 0) + 1;

    let grantedAt = null;
    let expiresAt = null;
    let deniedAt = null;

    if (dto.granted) {
      grantedAt = timestamp;
      // Set expiry to 2 years from now (GDPR recommendation)
      expiresAt = new Date(timestamp.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
    } else {
      deniedAt = timestamp;
    }

    // Create new consent record
    await this.pool.query(
      `INSERT INTO consent_records (
        id, tenant_id, user_id, purpose, status, version, 
        granted_at, expires_at, denied_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, tenantId, userId, dto.purpose, newStatus, version, grantedAt, expiresAt, deniedAt]
    );

    // Log the change
    await this.logConsentChange(
      id,
      dto.granted ? 'GRANTED' : 'DENIED',
      existing?.status,
      newStatus
    );

    logger.info('Consent updated', {
      userId,
      purpose: dto.purpose,
      status: newStatus,
    });

    return {
      id,
      tenant_id: tenantId,
      user_id: userId,
      purpose: dto.purpose,
      status: newStatus,
      version,
      granted_at: grantedAt,
      expires_at: expiresAt,
      denied_at: deniedAt,
    } as ConsentRecord;
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord> {
    const existing = await this.getConsent(userId, purpose);

    if (!existing) {
      throw new Error('No consent record found to withdraw');
    }

    if (existing.status === ConsentStatus.WITHDRAWN) {
      throw new Error('Consent already withdrawn');
    }

    // Update existing record
    await this.pool.query(
      `UPDATE consent_records 
       SET status = $1, withdrawn_at = $2 
       WHERE id = $3`,
      [ConsentStatus.WITHDRAWN, new Date(), existing.id]
    );

    // Log the withdrawal
    await this.logConsentChange(
      existing.id,
      'WITHDRAWN',
      existing.status,
      ConsentStatus.WITHDRAWN
    );

    logger.info('Consent withdrawn', {
      userId,
      purpose,
      previousStatus: existing.status,
    });

    // Return updated record
    const updatedResult = await this.pool.query(
      `SELECT * FROM consent_records WHERE id = $1`,
      [existing.id]
    );

    return updatedResult.rows[0] as ConsentRecord;
  }

  /**
   * Check if user has granted consent for a purpose
   */
  async checkConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
    const consent = await this.getConsent(userId, purpose);

    if (!consent) {
      return false;
    }

    // Check if consent is granted and not expired
    if (consent.status !== ConsentStatus.GRANTED) {
      return false;
    }

    if (consent.expires_at && new Date() > new Date(consent.expires_at)) {
      // Mark as expired
      await this.expireConsent(consent.id);
      return false;
    }

    return true;
  }

  /**
   * Mark consent as expired
   */
  private async expireConsent(consentId: string): Promise<void> {
    const existingResult = await this.pool.query(
      `SELECT * FROM consent_records WHERE id = $1`,
      [consentId]
    );

    if (existingResult.rows.length === 0) {
      return;
    }

    const existing = existingResult.rows[0];

    await this.pool.query(
      `UPDATE consent_records SET status = $1 WHERE id = $2`,
      [ConsentStatus.EXPIRED, consentId]
    );

    await this.logConsentChange(
      consentId,
      'EXPIRED',
      existing.status,
      ConsentStatus.EXPIRED
    );

    logger.info('Consent expired', { consentId });
  }

  /**
   * Log consent change to audit log
   */
  private async logConsentChange(
    consentId: string,
    action: 'GRANTED' | 'DENIED' | 'WITHDRAWN' | 'EXPIRED',
    previousStatus: ConsentStatus | undefined,
    newStatus: ConsentStatus
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO consent_audit_log 
       (id, consent_id, action, previous_status, new_status, changed_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), consentId, action, previousStatus, newStatus, new Date()]
    );
  }

  /**
   * Expire old consents (background job)
   */
  async expireOldConsents(): Promise<number> {
    const expiredConsentsResult = await this.pool.query(
      `SELECT id FROM consent_records 
       WHERE status = $1 AND expires_at < $2`,
      [ConsentStatus.GRANTED, new Date()]
    );

    const expiredConsents = expiredConsentsResult.rows;

    for (const consent of expiredConsents) {
      await this.expireConsent(consent.id);
    }

    logger.info('Expired old consents', { count: expiredConsents.length });

    return expiredConsents.length;
  }
}
