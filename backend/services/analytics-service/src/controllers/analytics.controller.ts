// import { serviceCache } from '../services/cache-integration'; // TODO: Remove if not needed
import { Request, Response, NextFunction } from 'express';
import { analyticsEngine } from '../analytics-engine/analytics-engine';
import { getRedis } from '../config/redis';

interface AuthenticatedRequest extends Request {
  venue?: { id: string; name: string };
}

class AnalyticsController {
  async getRevenueSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.revenue
      });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueByChannel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['revenue'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.revenue?.byChannel || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getRevenueProjections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const venueId = req.venue!.id;

      // Import revenue calculator directly for projections
      const { RevenueCalculator } = await import('../analytics-engine/calculators/revenue-calculator');
      const calculator = new RevenueCalculator();
      
      const projections = await calculator.projectRevenue(venueId, Number(days));

      res.json({
        success: true,
        data: projections
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerLifetimeValue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.clv || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerSegments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.segmentation || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getChurnRiskAnalysis(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['customerMetrics'],
        timeRange: {
          start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          end: new Date()
        }
      });

      res.json({
        success: true,
        data: result.customerMetrics?.churnRisk || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, granularity = 'day' } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['ticketSales'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string),
          granularity: granularity as 'hour' | 'day' | 'week' | 'month'
        }
      });

      res.json({
        success: true,
        data: result.ticketSales || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesTrends(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['salesTrends'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.salesTrends || {}
      });
    } catch (error) {
      next(error);
    }
  }

  async getEventPerformance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.topEvents || []
      });
    } catch (error) {
      next(error);
    }
  }

  async getTopPerformingEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = 10 } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['topEvents'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      const topEvents = (result.topEvents || []).slice(0, Number(limit));

      res.json({
        success: true,
        data: topEvents
      });
    } catch (error) {
      next(error);
    }
  }

  async getRealtimeSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const venueId = req.venue!.id;
      const redis = getRedis();
      
      const today = new Date().toISOString().split('T')[0];
      const purchaseKey = `metrics:purchase:${venueId}:${today}`;
      const trafficKey = `metrics:traffic:${venueId}:${today}`;
      
      const [purchases, traffic] = await Promise.all([
        redis.hgetall(purchaseKey),
        redis.hgetall(trafficKey)
      ]);

      res.json({
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
      next(error);
    }
  }

  async getConversionFunnel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const venueId = req.venue!.id;

      const result = await analyticsEngine.query({
        venueId,
        metrics: ['conversionRate'],
        timeRange: {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        }
      });

      res.json({
        success: true,
        data: result.conversionRate || []
      });
    } catch (error) {
      next(error);
    }
  }

  async executeCustomQuery(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { metrics, timeRange, filters, groupBy } = req.body;
      const venueId = req.venue!.id;

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

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { period = '7d' } = req.query;
      const venueId = req.venue!.id;

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

      res.json({
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
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
