import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { advancedFraudDetectionService } from '../services/fraud/advanced-fraud-detection.service';
import { fraudReviewService } from '../services/fraud/fraud-review.service';
import { db } from '../config/database';
import {
  serializeFraudCheckPublic,
  serializeFraudChecksAdmin,
  serializeIPReputationAdmin,
  serializeFraudRulesAdmin,
  ADMIN_FRAUD_CHECK_FIELDS,
  ADMIN_IP_REPUTATION_FIELDS,
} from '../serializers';

export default async function fraudRoutes(fastify: FastifyInstance) {
  /**
   * POST /check
   * Perform fraud check on a transaction
   */
  fastify.post('/check', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const fraudCheck = await advancedFraudDetectionService.performFraudCheck(request.body as any);
      // SECURITY: Only return decision to public APIs, never scores or signals
      return serializeFraudCheckPublic(fraudCheck);
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /review-queue
   * Get pending fraud reviews
   */
  fastify.get('/review-queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { priority, status, assignedTo, limit } = request.query as any;

      const reviews = await fraudReviewService.getPendingReviews({
        priority: priority as string,
        status: status as string,
        assignedTo: assignedTo as string,
        limit: limit ? parseInt(limit as string) : undefined
      });

      return { reviews };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /review-queue/:id/assign
   * Assign review to analyst
   */
  fastify.post<{ Params: { id: string } }>('/review-queue/:id/assign', async (request, reply) => {
    try {
      const { id } = request.params;
      const { analystId } = request.body as any;

      await fraudReviewService.assignReview(id, analystId);
      return { message: 'Review assigned successfully' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /review-queue/:id/complete
   * Complete fraud review with decision
   */
  fastify.post<{ Params: { id: string } }>('/review-queue/:id/complete', async (request, reply) => {
    try {
      const { id } = request.params;
      const { decision, reviewerNotes, reviewerId } = request.body as any;

      await fraudReviewService.completeReview(id, {
        decision,
        reviewerNotes,
        reviewerId
      });

      return { message: 'Review completed successfully' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /stats
   * Get fraud detection statistics
   */
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { startDate, endDate } = request.query as any;

      const dateRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const stats = await fraudReviewService.getReviewStats(dateRange);
      return stats;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /trends
   * Get fraud trends over time
   */
  fastify.get('/trends', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { days } = request.query as any;
      const daysNum = days ? parseInt(days as string) : 30;
      const trends = await fraudReviewService.getFraudTrends(daysNum);
      return { trends };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /signals
   * Get top fraud signals
   */
  fastify.get('/signals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { days } = request.query as any;
      const daysNum = days ? parseInt(days as string) : 30;
      const signals = await fraudReviewService.getTopFraudSignals(daysNum);
      return { signals };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /dashboard
   * Get comprehensive fraud dashboard data
   */
  fastify.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { days } = request.query as any;
      const daysNum = days ? parseInt(days as string) : 30;

      const [
        reviewStats,
        trends,
        topSignals,
        riskDistribution,
        recentHighRisk
      ] = await Promise.all([
        fraudReviewService.getReviewStats(),
        fraudReviewService.getFraudTrends(daysNum),
        fraudReviewService.getTopFraudSignals(daysNum),
        getRiskDistribution(daysNum),
        getRecentHighRiskTransactions(20)
      ]);

      return {
        reviewStats,
        trends,
        topSignals,
        riskDistribution,
        recentHighRisk
      };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /rules
   * Create custom fraud rule
   */
  fastify.post('/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { ruleName, description, ruleType, conditions, action, priority } = request.body as any;

      const [ruleId] = await db('fraud_rules').insert({
        rule_name: ruleName,
        description,
        rule_type: ruleType,
        conditions: JSON.stringify(conditions),
        action,
        priority: priority || 100,
        is_active: true
      }).returning('id');

      return reply.code(201).send({ ruleId });
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /rules
   * Get all fraud rules
   */
  fastify.get('/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // SECURITY: Select only safe fields - exclude 'conditions' which contains detection logic
      const rules = await db('fraud_rules')
        .select('id', 'tenant_id', 'rule_name', 'description', 'rule_type', 'action', 'priority', 'is_active', 'trigger_count', 'created_at', 'updated_at')
        .orderBy('priority', 'asc');

      // SECURITY: Serialize rules to ensure no sensitive fields leak
      return { rules: serializeFraudRulesAdmin(rules) };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * PUT /rules/:id
   * Update fraud rule
   */
  fastify.put<{ Params: { id: string } }>('/rules/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const updates = request.body as any;

      if (updates.conditions) {
        updates.conditions = JSON.stringify(updates.conditions);
      }

      await db('fraud_rules')
        .where('id', id)
        .update(updates);

      return { message: 'Rule updated successfully' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * DELETE /rules/:id
   * Deactivate fraud rule
   */
  fastify.delete<{ Params: { id: string } }>('/rules/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      await db('fraud_rules')
        .where('id', id)
        .update({ is_active: false });

      return { message: 'Rule deactivated successfully' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /ip/:ipAddress
   * Get IP reputation
   */
  fastify.get<{ Params: { ipAddress: string } }>('/ip/:ipAddress', async (request, reply) => {
    try {
      const { ipAddress } = request.params;

      // SECURITY: Select only admin-safe fields, exclude tracking internals
      const reputation = await db('ip_reputation')
        .select(ADMIN_IP_REPUTATION_FIELDS)
        .where('ip_address', ipAddress)
        .first();

      if (!reputation) {
        return reply.code(404).send({ error: 'IP not found' });
      }

      // SECURITY: Serialize IP reputation to filter sensitive fields
      return serializeIPReputationAdmin(reputation);
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /ip/:ipAddress/block
   * Block an IP address
   */
  fastify.post<{ Params: { ipAddress: string } }>('/ip/:ipAddress/block', async (request, reply) => {
    try {
      const { ipAddress } = request.params;
      const { reason } = request.body as any;

      await db('ip_reputation')
        .where('ip_address', ipAddress)
        .update({
          reputation_status: 'blocked',
          blocked_at: new Date(),
          blocked_reason: reason,
          risk_score: 100
        });

      return { message: 'IP blocked successfully' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /user/:userId/history
   * Get fraud check history for user
   */
  fastify.get<{ Params: { userId: string } }>('/user/:userId/history', async (request, reply) => {
    try {
      const { userId } = request.params;
      const { limit } = request.query as any;
      const limitNum = limit ? parseInt(limit as string) : 50;

      // SECURITY: Select only admin-safe fields - exclude signals, device_fingerprint, ip_address
      const history = await db('fraud_checks')
        .select(ADMIN_FRAUD_CHECK_FIELDS)
        .where('user_id', userId)
        .orderBy('timestamp', 'desc')
        .limit(limitNum);

      // SECURITY: Serialize fraud checks for admin view
      return { history: serializeFraudChecksAdmin(history) };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });
}

// Helper functions

async function getRiskDistribution(days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const distribution = await db('fraud_checks')
    .where('timestamp', '>=', startDate)
    .select(
      db.raw("CASE WHEN score < 0.3 THEN 'low' WHEN score < 0.6 THEN 'medium' ELSE 'high' END as risk_level"),
      db.raw('COUNT(*) as count')
    )
    .groupBy(db.raw("CASE WHEN score < 0.3 THEN 'low' WHEN score < 0.6 THEN 'medium' ELSE 'high' END"));

  return distribution.map((d: any) => ({
    riskLevel: d.risk_level,
    count: parseInt(d.count)
  }));
}

async function getRecentHighRiskTransactions(limit: number) {
  // SECURITY: Select only admin-safe fields - NEVER select signals, device_fingerprint, ip_address
  const transactions = await db('fraud_checks')
    .where('score', '>=', 0.6)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .select(ADMIN_FRAUD_CHECK_FIELDS);

  // SECURITY: Return serialized admin view - no signals exposed
  return transactions.map((t: any) => ({
    id: t.id,
    userId: t.user_id,
    paymentId: t.payment_id,
    score: t.score,
    riskScore: t.risk_score,
    decision: t.decision,
    checkType: t.check_type,
    timestamp: t.timestamp,
  }));
}
