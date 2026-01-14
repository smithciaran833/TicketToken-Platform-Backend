/**
 * Data Lifecycle Management for Marketplace Service
 * 
 * Issues Fixed:
 * - CMP-H1: No data anonymization → PII anonymization utility
 * - CMP-H2: No retention policy → Data retention enforcement
 * - CMP-H3: No SLA tracking for disputes → Dispute SLA monitoring
 * 
 * Features:
 * - GDPR-compliant data anonymization
 * - Configurable retention policies
 * - Automated data cleanup
 * - Dispute SLA tracking and alerting
 */

import knex from '../config/database';
import { logger } from './logger';
import { registry } from './metrics';
import { randomUUID } from 'crypto';

const log = logger.child({ component: 'DataLifecycle' });

// Configuration
const DATA_RETENTION_DAYS = {
  listings: parseInt(process.env.RETENTION_LISTINGS_DAYS || '365', 10),
  transfers: parseInt(process.env.RETENTION_TRANSFERS_DAYS || '2555', 10), // 7 years for financial
  disputes: parseInt(process.env.RETENTION_DISPUTES_DAYS || '2555', 10),
  audit_logs: parseInt(process.env.RETENTION_AUDIT_LOGS_DAYS || '2555', 10),
  user_activity: parseInt(process.env.RETENTION_USER_ACTIVITY_DAYS || '90', 10),
  session_data: parseInt(process.env.RETENTION_SESSION_DAYS || '30', 10)
};

// Dispute SLA configuration (in hours)
const DISPUTE_SLA = {
  acknowledge: parseInt(process.env.DISPUTE_SLA_ACKNOWLEDGE_HOURS || '24', 10),
  initial_response: parseInt(process.env.DISPUTE_SLA_RESPONSE_HOURS || '48', 10),
  resolution: parseInt(process.env.DISPUTE_SLA_RESOLUTION_HOURS || '336', 10) // 14 days
};

// Fields to anonymize per table
const ANONYMIZATION_FIELDS: Record<string, string[]> = {
  users: ['email', 'phone', 'first_name', 'last_name', 'wallet_address', 'ip_address'],
  transfers: ['buyer_email', 'seller_email', 'payment_method_last_four'],
  disputes: ['description', 'evidence'],
  listings: ['seller_display_name', 'description']
};

interface AnonymizationResult {
  table: string;
  recordsProcessed: number;
  success: boolean;
  error?: string;
}

interface RetentionResult {
  table: string;
  recordsDeleted: number;
  success: boolean;
  error?: string;
}

interface DisputeSLAStatus {
  disputeId: string;
  status: string;
  breaches: {
    acknowledge: boolean;
    initialResponse: boolean;
    resolution: boolean;
  };
  metrics: {
    ageHours: number;
    acknowledgeTimeHours?: number;
    responseTimeHours?: number;
    resolutionTimeHours?: number;
  };
}

/**
 * AUDIT FIX CMP-H1: Anonymize user data
 */
export async function anonymizeUserData(userId: string): Promise<AnonymizationResult[]> {
  const results: AnonymizationResult[] = [];
  const anonymizedId = `anon_${randomUUID().slice(0, 8)}`;
  
  log.info('Starting user data anonymization', { userId });

  try {
    // Start transaction
    await knex.transaction(async (trx) => {
      // Anonymize users table
      if (ANONYMIZATION_FIELDS.users) {
        const updateData: Record<string, any> = {
          anonymized: true,
          anonymized_at: new Date()
        };
        
        for (const field of ANONYMIZATION_FIELDS.users) {
          if (field === 'email') {
            updateData[field] = `${anonymizedId}@anonymized.local`;
          } else if (field === 'phone') {
            updateData[field] = '000-000-0000';
          } else if (field === 'wallet_address') {
            updateData[field] = null;
          } else {
            updateData[field] = '[ANONYMIZED]';
          }
        }
        
        const updated = await trx('users')
          .where('id', userId)
          .update(updateData);
        
        results.push({
          table: 'users',
          recordsProcessed: updated,
          success: true
        });
      }

      // Anonymize related transfers
      const transferUpdate = await trx('transfers')
        .where('buyer_id', userId)
        .orWhere('seller_id', userId)
        .update({
          buyer_email: '[ANONYMIZED]',
          seller_email: '[ANONYMIZED]',
          payment_method_last_four: null
        });
      
      results.push({
        table: 'transfers',
        recordsProcessed: transferUpdate,
        success: true
      });

      // Anonymize listings
      const listingsUpdate = await trx('listings')
        .where('seller_id', userId)
        .update({
          seller_display_name: '[ANONYMIZED]',
          description: '[ANONYMIZED]'
        });
      
      results.push({
        table: 'listings',
        recordsProcessed: listingsUpdate,
        success: true
      });

      // Anonymize disputes
      const disputesUpdate = await trx('disputes')
        .where('filed_by_user_id', userId)
        .orWhere('against_user_id', userId)
        .update({
          description: '[ANONYMIZED]',
          evidence: null
        });
      
      results.push({
        table: 'disputes',
        recordsProcessed: disputesUpdate,
        success: true
      });

      // Log anonymization action
      await trx('anonymization_log').insert({
        id: randomUUID(),
        user_id: userId,
        anonymized_id: anonymizedId,
        tables_affected: results.map(r => r.table).join(','),
        created_at: new Date()
      });
    });

    log.info('User data anonymization completed', { userId, results });
    
    registry.incrementCounter('marketplace_anonymization_total', {
      success: 'true'
    });

    return results;
  } catch (error: any) {
    log.error('User data anonymization failed', {
      userId,
      error: error.message
    });
    
    registry.incrementCounter('marketplace_anonymization_total', {
      success: 'false'
    });

    return [{
      table: 'all',
      recordsProcessed: 0,
      success: false,
      error: error.message
    }];
  }
}

/**
 * AUDIT FIX CMP-H2: Enforce data retention policy
 */
export async function enforceRetentionPolicy(): Promise<RetentionResult[]> {
  const results: RetentionResult[] = [];
  
  log.info('Starting data retention enforcement');

  // Expired listings (already sold/cancelled)
  try {
    const listingsCutoff = new Date();
    listingsCutoff.setDate(listingsCutoff.getDate() - DATA_RETENTION_DAYS.listings);
    
    const deletedListings = await knex('listings')
      .whereIn('status', ['sold', 'cancelled', 'expired'])
      .where('updated_at', '<', listingsCutoff)
      .delete();
    
    results.push({
      table: 'listings',
      recordsDeleted: deletedListings,
      success: true
    });
  } catch (error: any) {
    results.push({
      table: 'listings',
      recordsDeleted: 0,
      success: false,
      error: error.message
    });
  }

  // Old user activity logs
  try {
    const activityCutoff = new Date();
    activityCutoff.setDate(activityCutoff.getDate() - DATA_RETENTION_DAYS.user_activity);
    
    const deletedActivity = await knex('user_activity_log')
      .where('created_at', '<', activityCutoff)
      .delete();
    
    results.push({
      table: 'user_activity_log',
      recordsDeleted: deletedActivity,
      success: true
    });
  } catch (error: any) {
    results.push({
      table: 'user_activity_log',
      recordsDeleted: 0,
      success: false,
      error: error.message
    });
  }

  // Old session data
  try {
    const sessionCutoff = new Date();
    sessionCutoff.setDate(sessionCutoff.getDate() - DATA_RETENTION_DAYS.session_data);
    
    const deletedSessions = await knex('sessions')
      .where('expires_at', '<', sessionCutoff)
      .delete();
    
    results.push({
      table: 'sessions',
      recordsDeleted: deletedSessions,
      success: true
    });
  } catch (error: any) {
    results.push({
      table: 'sessions',
      recordsDeleted: 0,
      success: false,
      error: error.message
    });
  }

  // Calculate total deleted
  const totalDeleted = results.reduce((sum, r) => sum + r.recordsDeleted, 0);
  
  log.info('Data retention enforcement completed', {
    totalDeleted,
    results
  });
  
  registry.setGauge('marketplace_retention_deleted_total', totalDeleted);

  return results;
}

/**
 * AUDIT FIX CMP-H3: Get dispute SLA status
 */
export async function getDisputeSLAStatus(disputeId: string): Promise<DisputeSLAStatus | null> {
  try {
    const dispute = await knex('disputes')
      .where('id', disputeId)
      .first();

    if (!dispute) {
      return null;
    }

    const now = new Date();
    const createdAt = new Date(dispute.created_at);
    const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    // Calculate times for each milestone
    const acknowledgeTime = dispute.acknowledged_at
      ? (new Date(dispute.acknowledged_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      : null;
    
    const responseTime = dispute.first_response_at
      ? (new Date(dispute.first_response_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      : null;
    
    const resolutionTime = dispute.resolved_at
      ? (new Date(dispute.resolved_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60)
      : null;

    // Check for breaches
    const breaches = {
      acknowledge: !dispute.acknowledged_at && ageHours > DISPUTE_SLA.acknowledge,
      initialResponse: !dispute.first_response_at && ageHours > DISPUTE_SLA.initial_response,
      resolution: !dispute.resolved_at && dispute.status !== 'resolved' && ageHours > DISPUTE_SLA.resolution
    };

    return {
      disputeId,
      status: dispute.status,
      breaches,
      metrics: {
        ageHours: Math.round(ageHours * 10) / 10,
        acknowledgeTimeHours: acknowledgeTime ? Math.round(acknowledgeTime * 10) / 10 : undefined,
        responseTimeHours: responseTime ? Math.round(responseTime * 10) / 10 : undefined,
        resolutionTimeHours: resolutionTime ? Math.round(resolutionTime * 10) / 10 : undefined
      }
    };
  } catch (error: any) {
    log.error('Failed to get dispute SLA status', {
      disputeId,
      error: error.message
    });
    return null;
  }
}

/**
 * AUDIT FIX CMP-H3: Get all disputes with SLA breaches
 */
export async function getDisputeSLABreaches(): Promise<DisputeSLAStatus[]> {
  try {
    const now = new Date();
    
    // Get open disputes older than acknowledge SLA
    const acknowledgeThreshold = new Date(now.getTime() - DISPUTE_SLA.acknowledge * 60 * 60 * 1000);
    const responseThreshold = new Date(now.getTime() - DISPUTE_SLA.initial_response * 60 * 60 * 1000);
    const resolutionThreshold = new Date(now.getTime() - DISPUTE_SLA.resolution * 60 * 60 * 1000);

    const disputes = await knex('disputes')
      .whereIn('status', ['open', 'under_review'])
      .where(function() {
        this.where(function() {
          // Not acknowledged and past SLA
          this.whereNull('acknowledged_at')
            .where('created_at', '<', acknowledgeThreshold);
        }).orWhere(function() {
          // No response and past SLA
          this.whereNull('first_response_at')
            .where('created_at', '<', responseThreshold);
        }).orWhere(function() {
          // Not resolved and past SLA
          this.whereNull('resolved_at')
            .where('created_at', '<', resolutionThreshold);
        });
      })
      .select('id');

    const statuses: DisputeSLAStatus[] = [];
    for (const dispute of disputes) {
      const status = await getDisputeSLAStatus(dispute.id);
      if (status && (status.breaches.acknowledge || status.breaches.initialResponse || status.breaches.resolution)) {
        statuses.push(status);
      }
    }

    // Update metrics
    registry.setGauge('marketplace_dispute_sla_breaches', statuses.length);

    return statuses;
  } catch (error: any) {
    log.error('Failed to get dispute SLA breaches', { error: error.message });
    return [];
  }
}

/**
 * AUDIT FIX CMP-H3: Record dispute SLA metric
 */
export async function recordDisputeSLAMetric(
  disputeId: string,
  milestone: 'acknowledge' | 'response' | 'resolution'
): Promise<void> {
  try {
    const updateField = milestone === 'acknowledge' 
      ? 'acknowledged_at'
      : milestone === 'response'
        ? 'first_response_at'
        : 'resolved_at';

    await knex('disputes')
      .where('id', disputeId)
      .whereNull(updateField)
      .update({
        [updateField]: new Date()
      });

    // Get updated status for metrics
    const status = await getDisputeSLAStatus(disputeId);
    if (status) {
      const metricValue = milestone === 'acknowledge'
        ? status.metrics.acknowledgeTimeHours
        : milestone === 'response'
          ? status.metrics.responseTimeHours
          : status.metrics.resolutionTimeHours;

      if (metricValue !== undefined) {
        registry.observeHistogram('marketplace_dispute_sla_hours', metricValue, {
          milestone
        });
      }
    }

    log.info('Dispute SLA metric recorded', { disputeId, milestone });
  } catch (error: any) {
    log.error('Failed to record dispute SLA metric', {
      disputeId,
      milestone,
      error: error.message
    });
  }
}

/**
 * Get retention policy configuration
 */
export function getRetentionPolicy(): typeof DATA_RETENTION_DAYS {
  return { ...DATA_RETENTION_DAYS };
}

/**
 * Get dispute SLA configuration
 */
export function getDisputeSLAConfig(): typeof DISPUTE_SLA {
  return { ...DISPUTE_SLA };
}

// Export data lifecycle module
export const dataLifecycle = {
  anonymizeUser: anonymizeUserData,
  enforceRetention: enforceRetentionPolicy,
  getDisputeSLA: getDisputeSLAStatus,
  getDisputeBreaches: getDisputeSLABreaches,
  recordDisputeMilestone: recordDisputeSLAMetric,
  getRetentionPolicy,
  getSLAConfig: getDisputeSLAConfig
};
