import { AuthenticatedHandler } from '../types';
import { logger } from '../utils/logger';
import { createProblemError } from '../middleware/error-handler';

export const getSalesReport: AuthenticatedHandler = async (request, reply) => {
  try {
    const { db } = request.container.cradle;
    
    // CRITICAL FIX: Enforce tenant isolation
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    // Calculate sales from event_capacity (which tracks sold_count)
    const sales = await db('event_capacity')
      .join('events', 'event_capacity.event_id', 'events.id')
      .join('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
      .select(
        'events.id',
        'events.name as event_name',
        db.raw('SUM(event_capacity.sold_count) as tickets_sold'),
        db.raw('SUM(event_capacity.sold_count * event_pricing.base_price) as revenue')
      )
      .where('events.tenant_id', tenantId)
      .groupBy('events.id', 'events.name')
      .orderBy('revenue', 'desc');

    return reply.send({
      success: true,
      report: {
        type: 'sales',
        data: sales,
        generated_at: new Date(),
        note: 'Revenue calculated from event_capacity.sold_count * event_pricing.base_price'
      }
    });
  } catch (error: any) {
    logger.error({ error }, 'Sales report error');
    
    // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
    if (error.statusCode && error.code) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to generate sales report');
  }
};

export const getVenueComparisonReport: AuthenticatedHandler = async (request, reply) => {
  try {
    const { db } = request.container.cradle;
    
    // CRITICAL FIX: Enforce tenant isolation
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    const comparison = await db('events')
      .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
      .select(
        'events.venue_id',
        db.raw('COUNT(DISTINCT events.id) as event_count'),
        db.raw('SUM(event_capacity.sold_count) as total_sold'),
        db.raw('SUM(event_capacity.total_capacity) as total_capacity')
      )
      .where('events.tenant_id', tenantId)
      .groupBy('events.venue_id')
      .orderBy('total_sold', 'desc');

    return reply.send({
      success: true,
      report: {
        type: 'venue_comparison',
        data: comparison,
        generated_at: new Date()
      }
    });
  } catch (error: any) {
    logger.error({ error }, 'Venue comparison error');
    
    // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
    if (error.statusCode && error.code) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to generate venue comparison');
  }
};

export const getCustomerInsightsReport: AuthenticatedHandler = async (request, reply) => {
  try {
    const { db } = request.container.cradle;
    
    // CRITICAL FIX: Enforce tenant isolation
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
    }

    // Get insights by category from events + capacity
    const insights = await db('events')
      .join('event_categories', 'events.primary_category_id', 'event_categories.id')
      .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
      .leftJoin('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
      .select(
        'event_categories.name as category',
        db.raw('SUM(event_capacity.sold_count) as tickets_sold'),
        db.raw('AVG(event_pricing.base_price) as avg_ticket_price')
      )
      .where('events.tenant_id', tenantId)
      .groupBy('event_categories.id', 'event_categories.name')
      .orderBy('tickets_sold', 'desc');

    return reply.send({
      success: true,
      report: {
        type: 'customer_insights',
        data: insights,
        generated_at: new Date()
      }
    });
  } catch (error: any) {
    logger.error({ error }, 'Customer insights error');
    
    // HIGH PRIORITY FIX for Issue #4: Return appropriate status codes
    if (error.statusCode && error.code) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to generate customer insights');
  }
};
