import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { getRedisClient } from '../config/redis';
import { getAnalyticsDb } from '../config/database';

interface VenueParams {
  venueId: string;
}

interface DashboardParams {
  venueId: string;
  dashboardId: string;
}

interface CounterParams {
  venueId: string;
  counterType: string;
}

interface MetricsQuery {
  metrics?: string;
}

interface SubscribeQuery {
  metrics: string;
}

interface UpdateCounterBody {
  counterType: string;
  increment?: number;
}

class RealtimeController extends BaseController {
  getRealTimeMetrics = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: MetricsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { metrics } = request.query;
      const redis = getRedisClient();
      
      const today = new Date().toISOString().split('T')[0];
      const requestedMetrics = metrics ? metrics.split(',') : ['sales', 'traffic', 'conversion'];
      
      const metricsData: Record<string, any> = {};
      
      for (const metric of requestedMetrics) {
        const key = `metrics:${metric}:${venueId}:${today}`;
        const data = await redis.hgetall(key);
        metricsData[metric] = data || {};
      }
      
      // Get real-time summary from database
      const analyticsDb = getAnalyticsDb();
      const realtimeSummary = await analyticsDb('realtime_metrics')
        .where({ venue_id: venueId, metric_type: '1min_summary' })
        .first();
      
      return this.success(reply, { 
        metrics: metricsData,
        summary: realtimeSummary?.metric_value || {},
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  subscribeToMetrics = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: SubscribeQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { metrics } = request.query;
      
      // In production, would upgrade to WebSocket connection
      // For now, return subscription info for client to use with WebSocket
      const subscriptionId = `sub_${venueId}_${Date.now()}`;
      const requestedMetrics = metrics.split(',');
      
      return this.success(reply, { 
        subscriptionId,
        venueId,
        metrics: requestedMetrics,
        websocketUrl: `/ws/metrics/${venueId}`,
        message: 'Use WebSocket connection for real-time updates'
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getActiveSessions = async (
    request: FastifyRequest<{ Params: VenueParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const redis = getRedisClient();
      
      // Get active sessions count from Redis
      const sessionKey = `sessions:active:${venueId}`;
      const sessionCount = await redis.scard(sessionKey);
      
      // Get session details if available
      const sessionIds = await redis.smembers(sessionKey);
      const sessionDetails = await Promise.all(
        sessionIds.slice(0, 100).map(async (sessionId) => {
          const sessionData = await redis.hgetall(`session:${sessionId}`);
          return {
            sessionId,
            ...sessionData
          };
        })
      );
      
      return this.success(reply, { 
        sessions: sessionCount || 0,
        activeSessionDetails: sessionDetails,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getLiveDashboardStats = async (
    request: FastifyRequest<{ Params: DashboardParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, dashboardId } = request.params;
      const redis = getRedisClient();
      const analyticsDb = getAnalyticsDb();
      
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours();
      
      // Get live sales data
      const salesKey = `metrics:sales:${venueId}:${today}`;
      const salesData = await redis.hgetall(salesKey);
      
      // Get current hour analytics from DB
      const hourlyStats = await analyticsDb('venue_analytics')
        .where({
          venue_id: venueId,
          date: today,
          hour: currentHour
        })
        .first();
      
      // Get active alerts count
      const activeAlerts = await analyticsDb('venue_alerts')
        .where({ venue_id: venueId, is_active: true })
        .count('id as count')
        .first();
      
      return this.success(reply, { 
        stats: {
          dashboardId,
          sales: {
            today: parseInt(salesData.total_sales || '0'),
            revenue: parseFloat(salesData.revenue || '0'),
            avgOrderValue: parseFloat(salesData.avg_order || '0')
          },
          hourly: hourlyStats || {},
          activeAlerts: parseInt((activeAlerts as any)?.count || '0'),
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  updateCounter = async (
    request: FastifyRequest<{ Params: VenueParams; Body: UpdateCounterBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { counterType, increment = 1 } = request.body;
      const redis = getRedisClient();
      
      const counterKey = `counter:${counterType}:${venueId}`;
      const newValue = await redis.incrby(counterKey, increment);
      
      // Set expiry for daily counters (24 hours)
      if (counterType.includes('daily')) {
        await redis.expire(counterKey, 86400);
      }
      
      return this.success(reply, { 
        counterType,
        value: newValue,
        venueId 
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getCounter = async (
    request: FastifyRequest<{ Params: CounterParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, counterType } = request.params;
      const redis = getRedisClient();
      
      const counterKey = `counter:${counterType}:${venueId}`;
      const value = await redis.get(counterKey);
      
      return this.success(reply, { 
        counterType,
        value: parseInt(value || '0'),
        venueId
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const realtimeController = new RealtimeController();
