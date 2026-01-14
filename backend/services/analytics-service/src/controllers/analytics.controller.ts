import { FastifyRequest, FastifyReply } from 'fastify';
import { analyticsEngine } from '../analytics-engine/analytics-engine';
import { getRedis } from '../config/redis';

interface DateRangeQuery {
  startDate: string;
  endDate: string;
}

interface ProjectionQuery {
  days?: number;
}

interface SalesMetricsQuery extends DateRangeQuery {
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

interface TopEventsQuery extends DateRangeQuery {
  limit?: number;
}

interface DashboardQuery {
  period?: '24h' | '7d' | '30d' | '90d';
}

interface CustomQueryBody {
  metrics: string[];
  timeRange: {
    start: string;
    end: string;
    granularity?: 'hour' | 'day' | 'week' | 'month';
  };
  filters?: Record<string, any>;
  groupBy?: string[];
}

class AnalyticsController {
  /**
   * Helper method to safely extract venue ID from request.
   * Returns null if venue context is missing.
   */
  private getVenueId(request: FastifyRequest): string | null {
    return request.venue?.id || null;
  }

  /**
   * Helper method to send venue required error response.
   */
  private sendVenueRequiredError(reply: FastifyReply): FastifyReply {
    return reply.code(400).send({ success: false, error: 'Venue context required' });
  }

  async getRevenueSummary(
    request: FastifyRequest<{ Querystring: DateRangeQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      });

      return reply.send({
        success: true,
        data: result.revenue
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getRevenueByChannel(
    request: FastifyRequest<{ Querystring: DateRangeQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      });

      return reply.send({
        success: true,
        data: result.revenue?.byChannel || []
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getRevenueProjections(
    request: FastifyRequest<{ Querystring: ProjectionQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { days = 30 } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      // Import revenue calculator directly for projections
      const { RevenueCalculator } = await import('../analytics-engine/calculators/revenue-calculator.js');
      const calculator = new RevenueCalculator();

      const projections = await calculator.projectRevenue(venueId, Number(days));

      return reply.send({
        success: true,
        data: projections
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getCustomerLifetimeValue(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
          end: new Date()
        }
      });

      return reply.send({
        success: true,
        data: result.customerMetrics?.clv || {}
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getCustomerSegments(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      return reply.send({
        success: true,
        data: result.customerMetrics?.segmentation || []
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getChurnRiskAnalysis(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      return reply.send({
        success: true,
        data: result.customerMetrics?.churnRisk || {}
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getSalesMetrics(
    request: FastifyRequest<{ Querystring: SalesMetricsQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate, granularity = 'day' } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['ticketSales'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate),
          granularity
        }
      });

      return reply.send({
        success: true,
        data: result.ticketSales || []
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getSalesTrends(
    request: FastifyRequest<{ Querystring: DateRangeQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['salesTrends'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      });

      return reply.send({
        success: true,
        data: result.salesTrends || {}
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getEventPerformance(
    request: FastifyRequest<{ Querystring: DateRangeQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      });

      return reply.send({
        success: true,
        data: result.topEvents || []
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getTopPerformingEvents(
    request: FastifyRequest<{ Querystring: TopEventsQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate, limit = 10 } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      });

      const topEvents = (result.topEvents || []).slice(0, Number(limit));

      return reply.send({
        success: true,
        data: topEvents
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getRealtimeSummary(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }
      const redis = getRedis();

      const today = new Date().toISOString().split('T')[0];
      const purchaseKey = `metrics:purchase:${venueId}:${today}`;
      const trafficKey = `metrics:traffic:${venueId}:${today}`;

      const [purchases, traffic] = await Promise.all([
        redis.hgetall(purchaseKey),
        redis.hgetall(trafficKey)
      ]);

      return reply.send({
        success: true,
        data: {
          timestamp: new Date(),
          sales: {
            count: parseInt(purchases.total_sales || '0'),
            revenue: parseFloat(purchases.revenue || '0')
          },
          traffic: {
            pageViews: parseInt(traffic.page_views || '0')
          },
          conversionRate: traffic.page_views ?
            ((parseInt(purchases.total_sales || '0') / parseInt(traffic.page_views)) * 100).toFixed(2) : '0.00'
        }
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getConversionFunnel(
    request: FastifyRequest<{ Querystring: DateRangeQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { startDate, endDate } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['conversionRate'],
        timeRange: {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      });

      return reply.send({
        success: true,
        data: result.conversionRate || []
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async executeCustomQuery(
    request: FastifyRequest<{ Body: CustomQueryBody }>,
    reply: FastifyReply
  ) {
    try {
      const { metrics, timeRange, filters, groupBy } = request.body;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      const result = await analyticsEngine.query({
        venueId,
        metrics,
        timeRange: {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
          granularity: timeRange.granularity
        },
        filters,
        groupBy
      });

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }

  async getDashboardData(
    request: FastifyRequest<{ Querystring: DashboardQuery }>,
    reply: FastifyReply
  ) {
    try {
      const { period = '7d' } = request.query;
      const venueId = this.getVenueId(request);
      if (!venueId) {
        return this.sendVenueRequiredError(reply);
      }

      // Calculate date range based on period
      const endDate = new Date();
      let startDate = new Date();

      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Fetch multiple metrics in parallel
      const [revenueResult, salesResult, customerResult, eventsResult] = await Promise.all([
        analyticsEngine.query({
          venueId,
          metrics: ['revenue'],
          timeRange: { start: startDate, end: endDate }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['ticketSales'],
          timeRange: {
            start: startDate,
            end: endDate,
            granularity: period === '24h' ? 'hour' : 'day'
          }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['customerMetrics'],
          timeRange: { start: startDate, end: endDate }
        }),
        analyticsEngine.query({
          venueId,
          metrics: ['topEvents'],
          timeRange: { start: startDate, end: endDate }
        })
      ]);

      // Get real-time metrics
      const redis = getRedis();
      const today = new Date().toISOString().split('T')[0];
      const [todayPurchases, todayTraffic] = await Promise.all([
        redis.hgetall(`metrics:purchase:${venueId}:${today}`),
        redis.hgetall(`metrics:traffic:${venueId}:${today}`)
      ]);

      return reply.send({
        success: true,
        data: {
          period,
          summary: {
            totalRevenue: revenueResult.revenue?.byChannel?.total || 0,
            totalTicketsSold: salesResult.ticketSales?.reduce((sum: number, day: any) => sum + day.ticketsSold, 0) || 0,
            uniqueCustomers: customerResult.customerMetrics?.clv?.totalCustomers || 0,
            topEvent: eventsResult.topEvents?.[0] || null
          },
          realtime: {
            todayRevenue: parseFloat(todayPurchases.revenue || '0'),
            todaySales: parseInt(todayPurchases.total_sales || '0'),
            currentTraffic: parseInt(todayTraffic.page_views || '0')
          },
          charts: {
            revenue: revenueResult.revenue,
            sales: salesResult.ticketSales,
            customerSegments: customerResult.customerMetrics?.segmentation
          },
          topEvents: eventsResult.topEvents?.slice(0, 5)
        }
      });
    } catch (error) {
      request.log.error(error);
      throw error;
    }
  }
}

export const analyticsController = new AnalyticsController();
