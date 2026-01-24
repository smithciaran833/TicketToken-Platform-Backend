/**
 * Ticket Stats Client
 *
 * Extracted utility for fetching ticket statistics from ticket-service.
 * TODO #14: Extract getTicketStatsFromTicketService() to shared utility and reuse
 *
 * Used by:
 * - internal.routes.ts (scan-stats endpoint)
 * - event.service.ts (getSoldTicketCount)
 */

import axios from 'axios';
import { logger } from '../utils/logger';

const TICKET_SERVICE_URL = process.env.TICKET_SERVICE_URL || 'http://ticket-service:3000';
const TICKET_SERVICE_TIMEOUT = 5000; // 5 second timeout

export interface TicketStats {
  totalTickets: number;
  soldTickets: number;
  usedTickets: number;
  transferredTickets: number;
  cancelledTickets: number;
  validatedTickets: number;
  lastValidationAt: string | null;
}

export interface TicketStatsRequestContext {
  tenantId?: string;
  traceId?: string;
  serviceName?: string;
}

/**
 * Get ticket statistics for an event from ticket-service
 *
 * @param eventId - Event ID
 * @param ctx - Request context with tenantId and traceId
 * @returns Ticket statistics or null if failed
 */
export async function getTicketStatsFromTicketService(
  eventId: string,
  ctx: TicketStatsRequestContext = {}
): Promise<TicketStats | null> {
  const { tenantId, traceId, serviceName = 'event-service' } = ctx;

  try {
    const response = await axios.get<TicketStats>(
      `${TICKET_SERVICE_URL}/internal/tickets/event/${eventId}/stats`,
      {
        headers: {
          'x-internal-service': serviceName,
          'x-service-name': serviceName,
          'x-tenant-id': tenantId || '',
          'x-trace-id': traceId || '',
        },
        timeout: TICKET_SERVICE_TIMEOUT,
      }
    );

    return response.data;
  } catch (error: any) {
    // Log the error but don't fail - return fallback stats
    logger.warn({
      eventId,
      error: error.message,
      status: error.response?.status,
    }, 'Failed to fetch ticket stats from ticket-service, using fallback');

    // Return null to indicate fallback should be used
    return null;
  }
}

/**
 * Get sold ticket count for an event
 *
 * @param eventId - Event ID
 * @param ctx - Request context
 * @returns Sold ticket count or 0 if failed
 */
export async function getSoldTicketCountFromService(
  eventId: string,
  ctx: TicketStatsRequestContext = {}
): Promise<number> {
  const stats = await getTicketStatsFromTicketService(eventId, ctx);
  return stats?.soldTickets ?? 0;
}

/**
 * Default/empty ticket stats for use when service is unavailable
 */
export function getDefaultTicketStats(): TicketStats {
  return {
    totalTickets: 0,
    soldTickets: 0,
    usedTickets: 0,
    transferredTickets: 0,
    cancelledTickets: 0,
    validatedTickets: 0,
    lastValidationAt: null,
  };
}
