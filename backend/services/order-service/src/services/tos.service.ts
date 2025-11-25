import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  TOSVersion,
  TOSAcceptance,
  CreateTOSVersionRequest,
  AcceptTOSRequest,
  CheckComplianceRequest,
  ComplianceResult,
  ViolationType
} from '../types/tos.types';

export class TOSService {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async createVersion(tenantId: string, request: CreateTOSVersionRequest): Promise<TOSVersion> {
    const query = `
      INSERT INTO tos_versions (
        tenant_id, version_number, title, content_url, content_hash,
        effective_date, expiry_date, requires_acceptance, minimum_age,
        geographic_restrictions, change_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      tenantId,
      request.version_number,
      request.title,
      request.content_url,
      request.content_hash,
      request.effective_date,
      request.expiry_date || null,
      request.requires_acceptance ?? true,
      request.minimum_age ?? 18,
      request.geographic_restrictions ? JSON.stringify(request.geographic_restrictions) : null,
      request.change_summary || null
    ]);

    return result.rows[0];
  }

  async getActiveVersion(tenantId: string): Promise<TOSVersion | null> {
    const query = `
      SELECT * FROM tos_versions
      WHERE tenant_id = $1 AND is_active = true AND effective_date <= NOW()
        AND (expiry_date IS NULL OR expiry_date > NOW())
      ORDER BY effective_date DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [tenantId]);
    return result.rows[0] || null;
  }

  async acceptTOS(tenantId: string, userId: string, request: AcceptTOSRequest): Promise<TOSAcceptance> {
    const query = `
      INSERT INTO tos_acceptances (
        tenant_id, user_id, tos_version_id, ip_address, user_agent,
        acceptance_method, age_declared, location_country, location_region
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      tenantId,
      userId,
      request.tos_version_id,
      request.ip_address || null,
      request.user_agent || null,
      request.acceptance_method || 'CHECKBOX',
      request.age_declared || null,
      request.location_country || null,
      request.location_region || null
    ]);

    return result.rows[0];
  }

  async checkCompliance(tenantId: string, request: CheckComplianceRequest): Promise<ComplianceResult> {
    const activeVersion = await this.getActiveVersion(tenantId);
    if (!activeVersion) {
      return {
        compliant: true,
        tos_accepted: true,
        tos_current: true,
        age_verified: true,
        geo_allowed: true,
        violations: []
      };
    }

    const violations: string[] = [];
    
    // Check TOS acceptance
    const acceptanceQuery = `
      SELECT * FROM tos_acceptances
      WHERE tenant_id = $1 AND user_id = $2 AND tos_version_id = $3
      ORDER BY accepted_at DESC LIMIT 1
    `;
    const acceptanceResult = await this.db.query(acceptanceQuery, [tenantId, request.user_id, activeVersion.id]);
    const tosAccepted = acceptanceResult.rows.length > 0;

    if (!tosAccepted && activeVersion.requires_acceptance) {
      violations.push('TOS_NOT_ACCEPTED');
      await this.logViolation(tenantId, request.user_id, ViolationType.TOS_NOT_ACCEPTED, activeVersion.id, request.ip_address, request.location_country);
    }

    // Check age
    const ageQuery = `SELECT * FROM age_verifications WHERE tenant_id = $1 AND user_id = $2 AND verification_status = 'VERIFIED' ORDER BY verified_at DESC LIMIT 1`;
    const ageResult = await this.db.query(ageQuery, [tenantId, request.user_id]);
    const ageVerified = ageResult.rows.length > 0 && ageResult.rows[0].verified_age >= activeVersion.minimum_age;

    if (!ageVerified) {
      violations.push('AGE_RESTRICTION');
    }

    // Check geo restrictions
    const geoAllowed = await this.checkGeoRestrictions(tenantId, request.location_country, request.location_region);
    if (!geoAllowed) {
      violations.push('GEO_RESTRICTION');
    }

    return {
      compliant: violations.length === 0,
      tos_accepted: tosAccepted,
      tos_current: tosAccepted,
      age_verified: ageVerified,
      geo_allowed: geoAllowed,
      violations,
      required_tos_version: !tosAccepted ? activeVersion.version_number : undefined
    };
  }

  private async checkGeoRestrictions(tenantId: string, country?: string, region?: string): Promise<boolean> {
    if (!country) return true;

    const query = `
      SELECT * FROM geographic_restrictions
      WHERE tenant_id = $1 AND active = true
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
        AND (country_code = $2 OR country_code IS NULL)
    `;

    const result = await this.db.query(query, [tenantId, country]);
    if (result.rows.length === 0) return true;

    for (const restriction of result.rows) {
      if (restriction.restriction_type === 'COUNTRY_BLOCK' && restriction.country_code === country) {
        return false;
      }
    }

    return true;
  }

  private async logViolation(tenantId: string, userId: string, violationType: ViolationType, tosVersionId: string, ipAddress?: string, country?: string): Promise<void> {
    const query = `
      INSERT INTO access_violations (tenant_id, user_id, violation_type, tos_version_id, ip_address, location_country)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await this.db.query(query, [tenantId, userId, violationType, tosVersionId, ipAddress || null, country || null]);
  }

  async getUserAcceptances(tenantId: string, userId: string): Promise<TOSAcceptance[]> {
    const query = 'SELECT * FROM tos_acceptances WHERE tenant_id = $1 AND user_id = $2 ORDER BY accepted_at DESC';
    const result = await this.db.query(query, [tenantId, userId]);
    return result.rows;
  }
}
