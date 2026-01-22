import { AuthenticatedHandler } from '../types';
import { CancellationService } from '../services/cancellation.service';
import { logger } from '../utils/logger';
import { createProblemError } from '../middleware/error-handler';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  ValidationError,
  hasErrorCode
} from '../utils/errors';

/**
 * HIGH PRIORITY FIX for Issue #3:
 * Replaced string-matching error handling with typed error classes
 * Uses instanceof checks and createProblemError for RFC 7807 responses
 */
export const cancelEvent: AuthenticatedHandler = async (request, reply) => {
  try {
    const { eventId } = request.params as { eventId: string };
    const { cancellation_reason, trigger_refunds = true } = request.body as any;
    const { db } = request.container.cradle;
    const { userId, tenantId } = (request as any).auth;

    if (!cancellation_reason || cancellation_reason.trim().length === 0) {
      throw createProblemError(400, 'VALIDATION_ERROR', 'Cancellation reason is required');
    }

    // HIGH PRIORITY FIX for Issue #6: Use DI container instead of direct instantiation
    const cancellationService = request.container.resolve('cancellationService');

    // Validate permission - use canCancelEvent instead of validateCancellationPermission
    const permissionCheck = await cancellationService.canCancelEvent(eventId, tenantId);

    if (!permissionCheck.canCancel) {
      throw createProblemError(403, 'FORBIDDEN', permissionCheck.reason || 'You do not have permission to cancel this event');
    }

    // cancelEvent expects: eventId, tenantId, options
    const result = await cancellationService.cancelEvent(
      eventId,
      tenantId,
      {
        reason: cancellation_reason,
        refundPolicy: trigger_refunds ? 'full' : 'none',
        notifyHolders: true,
        cancelResales: true,
        generateReport: true,
        cancelledBy: userId
      }
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

    // HIGH PRIORITY FIX for Issue #3: Use instanceof checks instead of string matching
    if (error instanceof NotFoundError) {
      throw createProblemError(404, 'NOT_FOUND', error.message);
    }
    if (error instanceof BadRequestError || error instanceof ValidationError) {
      throw createProblemError(400, error.code, error.message);
    }
    if (error instanceof ConflictError) {
      throw createProblemError(409, 'CONFLICT', error.message);
    }
    if (error instanceof ForbiddenError) {
      throw createProblemError(403, 'FORBIDDEN', error.message);
    }
    
    // Check if error already has proper format from createProblemError
    if (hasErrorCode(error)) {
      throw createProblemError(error.statusCode, error.code, error.message);
    }
    
    // Unknown error - return 500
    throw createProblemError(500, 'INTERNAL_ERROR', error.message || 'Failed to cancel event');
  }
};
