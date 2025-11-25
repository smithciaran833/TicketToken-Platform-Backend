import { AuthenticatedHandler } from '../types';
import { CancellationService } from '../services/cancellation.service';
import { logger } from '../utils/logger';

export const cancelEvent: AuthenticatedHandler = async (request, reply) => {
  try {
    const { eventId } = request.params as { eventId: string };
    const { cancellation_reason, trigger_refunds = true } = request.body as any;
    const { db } = request.container.cradle;
    const { userId, tenantId } = (request as any).auth;

    if (!cancellation_reason || cancellation_reason.trim().length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Cancellation reason is required'
      });
    }

    const cancellationService = new CancellationService(db);

    // Validate permission
    const hasPermission = await cancellationService.validateCancellationPermission(
      eventId,
      userId,
      tenantId
    );

    if (!hasPermission) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to cancel this event'
      });
    }

    const result = await cancellationService.cancelEvent(
      {
        event_id: eventId,
        cancelled_by: userId,
        cancellation_reason,
        trigger_refunds
      },
      tenantId
    );

    logger.info({
      eventId,
      userId,
      tenantId,
      triggerRefunds: trigger_refunds
    }, 'Event cancellation initiated');

    return reply.send({
      success: true,
      data: result,
      message: 'Event cancelled successfully'
    });
  } catch (error: any) {
    logger.error({
      error,
      eventId: (request.params as any).eventId,
      userId: (request as any).auth?.userId
    }, 'Event cancellation failed');

    const statusCode = error.message.includes('not found') ? 404 :
                      error.message.includes('deadline') ? 400 :
                      error.message.includes('already cancelled') ? 409 : 500;

    return reply.status(statusCode).send({
      success: false,
      error: error.message || 'Failed to cancel event'
    });
  }
};
