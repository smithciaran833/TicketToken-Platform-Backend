/**
 * Webhook Routes for Compliance Service
 * 
 * AUDIT FIX SEC-2: Remove hardcoded webhook secret - now uses env var from auth middleware
 */
import { FastifyInstance } from 'fastify';
import { webhookAuth } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../services/database.service';

// No hardcoded secrets! Webhook secret comes from environment via auth middleware.

// Type definitions for webhook payloads
interface TaxUpdatePayload {
  venueId: string;
  taxId?: string;
  taxType: 'sales' | 'income' | 'property' | 'other';
  status: 'valid' | 'invalid' | 'pending' | 'expired';
  effectiveDate?: string;
  expirationDate?: string;
  jurisdiction?: string;
  taxRate?: number;
  metadata?: Record<string, any>;
}

interface KYCUpdatePayload {
  venueId: string;
  userId?: string;
  verificationType: 'identity' | 'business' | 'address' | 'document';
  status: 'approved' | 'rejected' | 'pending_review' | 'expired';
  verificationId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  rejectionReason?: string;
  documentTypes?: string[];
  metadata?: Record<string, any>;
}

interface RiskAlertPayload {
  alertId: string;
  alertType: 'fraud' | 'velocity' | 'sanctions' | 'suspicious_activity' | 'threshold_breach';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityType: 'venue' | 'user' | 'transaction';
  entityId: string;
  description: string;
  riskScore?: number;
  indicators?: string[];
  recommendedAction?: string;
  metadata?: Record<string, any>;
}

interface OFACResultPayload {
  screeningId: string;
  entityType: 'individual' | 'business';
  entityId: string;
  entityName: string;
  status: 'clear' | 'potential_match' | 'confirmed_match' | 'false_positive';
  matchScore?: number;
  matchedList?: string;
  matchedEntry?: string;
  reviewRequired: boolean;
  metadata?: Record<string, any>;
}

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * Tax update webhook
   * Receives tax-related updates from external systems
   */
  fastify.post('/webhooks/compliance/tax-update', {
    onRequest: webhookAuth()  // Uses WEBHOOK_SECRET from env
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      
      logger.info({ 
        requestId: request.requestId,
        tenantId, 
        event: 'tax-update'
      }, 'Tax update webhook received');
      
      const body = request.body as TaxUpdatePayload;
      
      // Validate required fields
      if (!body.venueId || !body.taxType || !body.status) {
        return reply.code(400).send({
          error: 'Missing required fields: venueId, taxType, status',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      }
      
      // Store the tax update record
      await db.query(
        `INSERT INTO tax_records 
         (tenant_id, venue_id, tax_id, tax_type, status, effective_date, expiration_date, jurisdiction, tax_rate, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         ON CONFLICT (tenant_id, venue_id, tax_type) 
         DO UPDATE SET 
           tax_id = EXCLUDED.tax_id,
           status = EXCLUDED.status,
           effective_date = EXCLUDED.effective_date,
           expiration_date = EXCLUDED.expiration_date,
           jurisdiction = EXCLUDED.jurisdiction,
           tax_rate = EXCLUDED.tax_rate,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          tenantId,
          body.venueId,
          body.taxId || null,
          body.taxType,
          body.status,
          body.effectiveDate ? new Date(body.effectiveDate) : null,
          body.expirationDate ? new Date(body.expirationDate) : null,
          body.jurisdiction || null,
          body.taxRate || null,
          JSON.stringify(body.metadata || {})
        ]
      );
      
      // Update venue verification status based on tax status
      if (body.status === 'valid') {
        await db.query(
          `UPDATE venue_verifications 
           SET tax_verified = true, updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [body.venueId, tenantId]
        );
      } else if (body.status === 'invalid' || body.status === 'expired') {
        await db.query(
          `UPDATE venue_verifications 
           SET tax_verified = false, updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [body.venueId, tenantId]
        );
        
        // Log compliance event for audit
        await db.query(
          `INSERT INTO compliance_audit_log 
           (tenant_id, event_type, entity_type, entity_id, details, created_at)
           VALUES ($1, 'tax_status_change', 'venue', $2, $3, NOW())`,
          [tenantId, body.venueId, JSON.stringify({ status: body.status, taxType: body.taxType })]
        );
      }
      
      logger.info({ 
        tenantId, 
        venueId: body.venueId, 
        taxType: body.taxType,
        status: body.status 
      }, 'Tax update processed successfully');
      
      return reply.send({ 
        received: true,
        requestId: request.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error({ 
        requestId: request.requestId,
        error: error.message,
        stack: error.stack
      }, 'Webhook processing error');
      
      return reply.code(500).send({ 
        error: 'Webhook processing failed',
        type: 'urn:error:compliance-service:webhook-error',
        status: 500
      });
    }
  });

  /**
   * KYC update webhook
   * Receives Know Your Customer verification updates
   */
  fastify.post('/webhooks/compliance/kyc-update', {
    onRequest: webhookAuth()
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      
      logger.info({ 
        requestId: request.requestId,
        tenantId, 
        event: 'kyc-update'
      }, 'KYC update webhook received');
      
      const body = request.body as KYCUpdatePayload;
      
      // Validate required fields
      if (!body.venueId || !body.verificationType || !body.status) {
        return reply.code(400).send({
          error: 'Missing required fields: venueId, verificationType, status',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      }
      
      // Store KYC verification record
      await db.query(
        `INSERT INTO kyc_verifications 
         (tenant_id, venue_id, user_id, verification_type, status, verification_id, risk_level, rejection_reason, document_types, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         ON CONFLICT (tenant_id, venue_id, verification_type) 
         DO UPDATE SET 
           user_id = EXCLUDED.user_id,
           status = EXCLUDED.status,
           verification_id = EXCLUDED.verification_id,
           risk_level = EXCLUDED.risk_level,
           rejection_reason = EXCLUDED.rejection_reason,
           document_types = EXCLUDED.document_types,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          tenantId,
          body.venueId,
          body.userId || null,
          body.verificationType,
          body.status,
          body.verificationId || null,
          body.riskLevel || 'medium',
          body.rejectionReason || null,
          JSON.stringify(body.documentTypes || []),
          JSON.stringify(body.metadata || {})
        ]
      );
      
      // Update venue verification status
      if (body.status === 'approved') {
        const kycField = body.verificationType === 'identity' ? 'identity_verified' :
                         body.verificationType === 'business' ? 'business_verified' :
                         body.verificationType === 'address' ? 'address_verified' : 'document_verified';
        
        await db.query(
          `UPDATE venue_verifications 
           SET ${kycField} = true, updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [body.venueId, tenantId]
        );
      } else if (body.status === 'rejected' || body.status === 'expired') {
        // Send compliance notification for rejected/expired KYC
        await db.query(
          `INSERT INTO compliance_notifications 
           (tenant_id, venue_id, notification_type, severity, message, status, created_at)
           VALUES ($1, $2, 'kyc_issue', 'high', $3, 'pending', NOW())`,
          [
            tenantId,
            body.venueId,
            `KYC ${body.verificationType} verification ${body.status}: ${body.rejectionReason || 'No reason provided'}`
          ]
        );
      }
      
      // Update risk assessment based on KYC result
      if (body.riskLevel) {
        await db.query(
          `INSERT INTO risk_assessments 
           (tenant_id, entity_type, entity_id, risk_level, risk_source, created_at, updated_at)
           VALUES ($1, 'venue', $2, $3, 'kyc_verification', NOW(), NOW())
           ON CONFLICT (tenant_id, entity_type, entity_id) 
           DO UPDATE SET 
             risk_level = CASE 
               WHEN EXCLUDED.risk_level = 'high' THEN 'high'
               WHEN risk_assessments.risk_level = 'high' THEN 'high'
               WHEN EXCLUDED.risk_level = 'medium' THEN 'medium'
               ELSE risk_assessments.risk_level
             END,
             updated_at = NOW()`,
          [tenantId, body.venueId, body.riskLevel]
        );
      }
      
      // Log compliance audit event
      await db.query(
        `INSERT INTO compliance_audit_log 
         (tenant_id, event_type, entity_type, entity_id, details, created_at)
         VALUES ($1, 'kyc_update', 'venue', $2, $3, NOW())`,
        [tenantId, body.venueId, JSON.stringify({ verificationType: body.verificationType, status: body.status })]
      );
      
      logger.info({ 
        tenantId, 
        venueId: body.venueId, 
        verificationType: body.verificationType,
        status: body.status 
      }, 'KYC update processed successfully');
      
      return reply.send({ 
        received: true,
        requestId: request.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error({ 
        requestId: request.requestId,
        error: error.message,
        stack: error.stack
      }, 'Webhook processing error');
      
      return reply.code(500).send({ 
        error: 'Webhook processing failed',
        type: 'urn:error:compliance-service:webhook-error',
        status: 500
      });
    }
  });

  /**
   * Risk alert webhook
   * Receives real-time risk alerts from monitoring systems
   */
  fastify.post('/webhooks/compliance/risk-alert', {
    onRequest: webhookAuth()
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      
      logger.info({ 
        requestId: request.requestId,
        tenantId, 
        event: 'risk-alert'
      }, 'Risk alert webhook received');
      
      const body = request.body as RiskAlertPayload;
      
      // Validate required fields
      if (!body.alertId || !body.alertType || !body.severity || !body.entityType || !body.entityId) {
        return reply.code(400).send({
          error: 'Missing required fields: alertId, alertType, severity, entityType, entityId',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      }
      
      // Store risk alert record
      await db.query(
        `INSERT INTO risk_alerts 
         (tenant_id, alert_id, alert_type, severity, entity_type, entity_id, description, risk_score, indicators, recommended_action, status, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, NOW(), NOW())
         ON CONFLICT (alert_id) 
         DO UPDATE SET 
           severity = EXCLUDED.severity,
           risk_score = EXCLUDED.risk_score,
           indicators = EXCLUDED.indicators,
           recommended_action = EXCLUDED.recommended_action,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          tenantId,
          body.alertId,
          body.alertType,
          body.severity,
          body.entityType,
          body.entityId,
          body.description,
          body.riskScore || null,
          JSON.stringify(body.indicators || []),
          body.recommendedAction || null,
          JSON.stringify(body.metadata || {})
        ]
      );
      
      // Update entity risk score
      const riskLevel = body.severity === 'critical' ? 'critical' :
                        body.severity === 'high' ? 'high' :
                        body.severity === 'medium' ? 'medium' : 'low';
      
      await db.query(
        `INSERT INTO risk_assessments 
         (tenant_id, entity_type, entity_id, risk_level, risk_score, risk_source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (tenant_id, entity_type, entity_id) 
         DO UPDATE SET 
           risk_level = CASE 
             WHEN EXCLUDED.risk_level = 'critical' THEN 'critical'
             WHEN risk_assessments.risk_level = 'critical' THEN 'critical'
             WHEN EXCLUDED.risk_level = 'high' THEN 'high'
             WHEN risk_assessments.risk_level = 'high' THEN 'high'
             ELSE EXCLUDED.risk_level
           END,
           risk_score = COALESCE(EXCLUDED.risk_score, risk_assessments.risk_score),
           updated_at = NOW()`,
        [tenantId, body.entityType, body.entityId, riskLevel, body.riskScore || null, `risk_alert:${body.alertType}`]
      );
      
      // Trigger escalation for high/critical severity alerts
      if (body.severity === 'high' || body.severity === 'critical') {
        // Create compliance notification for compliance team
        await db.query(
          `INSERT INTO compliance_notifications 
           (tenant_id, venue_id, notification_type, severity, message, status, alert_id, created_at)
           VALUES ($1, $2, 'risk_alert', $3, $4, 'pending', $5, NOW())`,
          [
            tenantId,
            body.entityType === 'venue' ? body.entityId : null,
            body.severity,
            `${body.alertType.toUpperCase()} Alert: ${body.description}`,
            body.alertId
          ]
        );
        
        // For critical alerts, also send immediate notification
        if (body.severity === 'critical') {
          await db.query(
            `INSERT INTO urgent_notifications 
             (tenant_id, notification_type, entity_type, entity_id, message, priority, status, created_at)
             VALUES ($1, 'critical_risk_alert', $2, $3, $4, 1, 'pending', NOW())`,
            [tenantId, body.entityType, body.entityId, body.description]
          );
          
          logger.warn({ 
            tenantId, 
            alertId: body.alertId,
            severity: body.severity,
            entityType: body.entityType,
            entityId: body.entityId
          }, 'CRITICAL risk alert - immediate escalation required');
        }
      }
      
      // Log compliance audit event
      await db.query(
        `INSERT INTO compliance_audit_log 
         (tenant_id, event_type, entity_type, entity_id, details, created_at)
         VALUES ($1, 'risk_alert_received', $2, $3, $4, NOW())`,
        [tenantId, body.entityType, body.entityId, JSON.stringify({ alertId: body.alertId, alertType: body.alertType, severity: body.severity })]
      );
      
      logger.info({ 
        tenantId, 
        alertId: body.alertId,
        alertType: body.alertType,
        severity: body.severity,
        entityType: body.entityType,
        entityId: body.entityId
      }, 'Risk alert processed successfully');
      
      return reply.send({ 
        received: true,
        requestId: request.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error({ 
        requestId: request.requestId,
        error: error.message,
        stack: error.stack
      }, 'Webhook processing error');
      
      return reply.code(500).send({ 
        error: 'Webhook processing failed',
        type: 'urn:error:compliance-service:webhook-error',
        status: 500
      });
    }
  });

  /**
   * OFAC screening result webhook
   * Receives results from OFAC screening service
   */
  fastify.post('/webhooks/compliance/ofac-result', {
    onRequest: webhookAuth()
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      
      logger.info({ 
        requestId: request.requestId,
        tenantId, 
        event: 'ofac-result'
      }, 'OFAC result webhook received');
      
      const body = request.body as OFACResultPayload;
      
      // Validate required fields
      if (!body.screeningId || !body.entityType || !body.entityId || !body.entityName || !body.status) {
        return reply.code(400).send({
          error: 'Missing required fields: screeningId, entityType, entityId, entityName, status',
          type: 'urn:error:compliance-service:validation-error',
          status: 400
        });
      }
      
      // Store OFAC screening result
      await db.query(
        `INSERT INTO ofac_screenings 
         (tenant_id, screening_id, entity_type, entity_id, entity_name, status, match_score, matched_list, matched_entry, review_required, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         ON CONFLICT (screening_id) 
         DO UPDATE SET 
           status = EXCLUDED.status,
           match_score = EXCLUDED.match_score,
           matched_list = EXCLUDED.matched_list,
           matched_entry = EXCLUDED.matched_entry,
           review_required = EXCLUDED.review_required,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          tenantId,
          body.screeningId,
          body.entityType,
          body.entityId,
          body.entityName,
          body.status,
          body.matchScore || null,
          body.matchedList || null,
          body.matchedEntry || null,
          body.reviewRequired,
          JSON.stringify(body.metadata || {})
        ]
      );
      
      // Update venue compliance status based on OFAC result
      if (body.status === 'clear') {
        await db.query(
          `UPDATE venue_verifications 
           SET ofac_cleared = true, ofac_last_check = NOW(), updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [body.entityId, tenantId]
        );
      } else if (body.status === 'potential_match' || body.status === 'confirmed_match') {
        // Flag venue for review
        await db.query(
          `UPDATE venue_verifications 
           SET ofac_cleared = false, ofac_last_check = NOW(), ofac_review_required = true, updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [body.entityId, tenantId]
        );
        
        // Create high-priority compliance notification
        const severity = body.status === 'confirmed_match' ? 'critical' : 'high';
        await db.query(
          `INSERT INTO compliance_notifications 
           (tenant_id, venue_id, notification_type, severity, message, status, created_at)
           VALUES ($1, $2, 'ofac_match', $3, $4, 'pending', NOW())`,
          [
            tenantId,
            body.entityId,
            severity,
            `OFAC ${body.status.replace('_', ' ')}: ${body.entityName} - ${body.matchedList || 'Unknown list'}. Match score: ${body.matchScore || 'N/A'}%`
          ]
        );
        
        // Update risk assessment
        await db.query(
          `INSERT INTO risk_assessments 
           (tenant_id, entity_type, entity_id, risk_level, risk_score, risk_source, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'ofac_screening', NOW(), NOW())
           ON CONFLICT (tenant_id, entity_type, entity_id) 
           DO UPDATE SET 
             risk_level = CASE 
               WHEN EXCLUDED.risk_level = 'critical' THEN 'critical'
               ELSE EXCLUDED.risk_level
             END,
             risk_score = GREATEST(COALESCE(risk_assessments.risk_score, 0), EXCLUDED.risk_score),
             updated_at = NOW()`,
          [
            tenantId,
            body.entityType === 'business' ? 'venue' : 'user',
            body.entityId,
            body.status === 'confirmed_match' ? 'critical' : 'high',
            body.matchScore || 80
          ]
        );
        
        // For confirmed matches, block venue activity
        if (body.status === 'confirmed_match') {
          await db.query(
            `UPDATE venues 
             SET status = 'suspended', suspended_reason = 'OFAC match confirmed', updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [body.entityId, tenantId]
          );
          
          logger.error({ 
            tenantId, 
            entityId: body.entityId,
            entityName: body.entityName,
            matchedList: body.matchedList
          }, 'OFAC CONFIRMED MATCH - Venue suspended');
        }
      } else if (body.status === 'false_positive') {
        // Clear false positive
        await db.query(
          `UPDATE venue_verifications 
           SET ofac_cleared = true, ofac_last_check = NOW(), ofac_review_required = false, updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [body.entityId, tenantId]
        );
        
        // Resolve any pending OFAC notifications
        await db.query(
          `UPDATE compliance_notifications 
           SET status = 'resolved', resolved_at = NOW(), resolution_notes = 'False positive confirmed'
           WHERE venue_id = $1 AND tenant_id = $2 AND notification_type = 'ofac_match' AND status = 'pending'`,
          [body.entityId, tenantId]
        );
      }
      
      // Log compliance audit event
      await db.query(
        `INSERT INTO compliance_audit_log 
         (tenant_id, event_type, entity_type, entity_id, details, created_at)
         VALUES ($1, 'ofac_screening_result', $2, $3, $4, NOW())`,
        [
          tenantId, 
          body.entityType === 'business' ? 'venue' : 'user',
          body.entityId, 
          JSON.stringify({ screeningId: body.screeningId, status: body.status, matchScore: body.matchScore })
        ]
      );
      
      logger.info({ 
        tenantId, 
        screeningId: body.screeningId,
        entityType: body.entityType,
        entityId: body.entityId,
        status: body.status
      }, 'OFAC result processed successfully');
      
      return reply.send({ 
        received: true,
        requestId: request.requestId,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error({ 
        requestId: request.requestId,
        error: error.message,
        stack: error.stack
      }, 'Webhook processing error');
      
      return reply.code(500).send({ 
        error: 'Webhook processing failed',
        type: 'urn:error:compliance-service:webhook-error',
        status: 500
      });
    }
  });
}

export default webhookRoutes;
