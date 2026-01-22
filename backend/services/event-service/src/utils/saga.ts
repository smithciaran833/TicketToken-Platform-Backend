/**
 * Saga Pattern Implementation
 *
 * CRITICAL FIX for audit finding EC6: Compensating transactions
 *
 * The Saga pattern provides a way to manage distributed transactions
 * where each step has a corresponding compensating action (rollback).
 * If any step fails, all previous steps are rolled back in reverse order.
 *
 * Usage:
 * ```
 * const saga = new Saga('create-event')
 *   .addStep(
 *     'create-event-record',
 *     async (ctx) => { ... create event ... return eventId; },
 *     async (ctx, data) => { ... delete event ... }
 *   )
 *   .addStep(
 *     'create-schedule',
 *     async (ctx) => { ... create schedule ... },
 *     async (ctx, data) => { ... delete schedule ... }
 *   );
 *
 * const result = await saga.execute({ userId, tenantId });
 * ```
 */

import { logger } from './logger';

/**
 * Saga step definition
 */
export interface SagaStep<TContext, TResult = any> {
  /** Unique step name for logging/debugging */
  name: string;
  /** Execute the step - should return data needed for compensation */
  execute: (context: TContext, previousResults: Map<string, any>) => Promise<TResult>;
  /** Compensate (rollback) the step */
  compensate: (context: TContext, stepData: TResult, previousResults: Map<string, any>) => Promise<void>;
}

/**
 * Saga execution result
 */
export interface SagaResult<TResult> {
  success: boolean;
  result?: TResult;
  error?: Error;
  completedSteps: string[];
  failedStep?: string;
  compensatedSteps: string[];
}

/**
 * Saga execution options
 */
export interface SagaOptions {
  /** Maximum time for the entire saga (ms) */
  timeout?: number;
  /** Maximum retries per step */
  maxRetries?: number;
  /** Delay between retries (ms) */
  retryDelay?: number;
  /** Whether to continue compensation even if a compensate fails */
  continueCompensationOnError?: boolean;
}

const DEFAULT_OPTIONS: SagaOptions = {
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000,
  continueCompensationOnError: true,
};

/**
 * Saga orchestrator class
 *
 * Manages multi-step operations with automatic rollback on failure.
 */
export class Saga<TContext> {
  private steps: SagaStep<TContext>[] = [];
  private options: SagaOptions;

  constructor(
    private name: string,
    options: Partial<SagaOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Add a step to the saga
   */
  addStep<TResult = any>(
    name: string,
    execute: SagaStep<TContext, TResult>['execute'],
    compensate: SagaStep<TContext, TResult>['compensate']
  ): this {
    this.steps.push({ name, execute, compensate });
    return this;
  }

  /**
   * Execute the saga
   */
  async execute(context: TContext): Promise<SagaResult<Map<string, any>>> {
    const startTime = Date.now();
    const results = new Map<string, any>();
    const completedSteps: string[] = [];
    const compensatedSteps: string[] = [];

    logger.info({ sagaName: this.name, stepCount: this.steps.length }, 'Starting saga execution');

    try {
      // Execute steps in order
      for (const step of this.steps) {
        // Check timeout
        if (this.options.timeout && Date.now() - startTime > this.options.timeout) {
          throw new SagaTimeoutError(`Saga ${this.name} timed out after ${this.options.timeout}ms`);
        }

        logger.debug({ sagaName: this.name, step: step.name }, 'Executing saga step');

        try {
          const stepResult = await this.executeStepWithRetry(step, context, results);
          results.set(step.name, stepResult);
          completedSteps.push(step.name);

          logger.debug({ sagaName: this.name, step: step.name }, 'Saga step completed');
        } catch (error) {
          logger.error({
            sagaName: this.name,
            step: step.name,
            error: error instanceof Error ? error.message : String(error),
          }, 'Saga step failed, starting compensation');

          // Compensate completed steps in reverse order
          await this.compensate(context, results, completedSteps, compensatedSteps);

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            completedSteps,
            failedStep: step.name,
            compensatedSteps,
          };
        }
      }

      const duration = Date.now() - startTime;
      logger.info({
        sagaName: this.name,
        duration,
        stepCount: completedSteps.length,
      }, 'Saga completed successfully');

      return {
        success: true,
        result: results,
        completedSteps,
        compensatedSteps: [],
      };
    } catch (error) {
      logger.error({
        sagaName: this.name,
        error: error instanceof Error ? error.message : String(error),
      }, 'Saga failed with unexpected error');

      // Compensate any completed steps
      await this.compensate(context, results, completedSteps, compensatedSteps);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        completedSteps,
        compensatedSteps,
      };
    }
  }

  /**
   * Execute a step with retry logic
   */
  private async executeStepWithRetry(
    step: SagaStep<TContext>,
    context: TContext,
    results: Map<string, any>
  ): Promise<any> {
    let lastError: Error | undefined;
    const maxRetries = this.options.maxRetries || 3;
    const retryDelay = this.options.retryDelay || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await step.execute(context, results);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on validation errors or non-retryable errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          logger.warn({
            sagaName: this.name,
            step: step.name,
            attempt,
            maxRetries,
            error: lastError.message,
          }, 'Saga step failed, retrying');

          await this.delay(retryDelay * attempt); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Compensate completed steps in reverse order
   */
  private async compensate(
    context: TContext,
    results: Map<string, any>,
    completedSteps: string[],
    compensatedSteps: string[]
  ): Promise<void> {
    // Get steps in reverse order
    const stepsToCompensate = [...completedSteps].reverse();

    for (const stepName of stepsToCompensate) {
      const step = this.steps.find(s => s.name === stepName);
      if (!step) continue;

      const stepData = results.get(stepName);

      try {
        logger.debug({ sagaName: this.name, step: stepName }, 'Compensating saga step');
        await step.compensate(context, stepData, results);
        compensatedSteps.push(stepName);
        logger.debug({ sagaName: this.name, step: stepName }, 'Saga step compensated');
      } catch (error) {
        logger.error({
          sagaName: this.name,
          step: stepName,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to compensate saga step');

        if (!this.options.continueCompensationOnError) {
          throw new SagaCompensationError(
            `Failed to compensate step ${stepName}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        // Continue compensating other steps even if one fails
      }
    }
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Don't retry validation, not found, or forbidden errors
      const nonRetryablePatterns = [
        'validation',
        'not found',
        'forbidden',
        'unauthorized',
        'invalid',
      ];
      const message = error.message.toLowerCase();
      return nonRetryablePatterns.some(pattern => message.includes(pattern));
    }
    return false;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Saga timeout error
 */
export class SagaTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SagaTimeoutError';
  }
}

/**
 * Saga compensation error
 */
export class SagaCompensationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SagaCompensationError';
  }
}

/**
 * Helper to create a simple saga for event operations
 */
export function createEventSaga(name: string): Saga<{
  eventId?: string;
  tenantId: string;
  userId: string;
  db: any;
}> {
  return new Saga(name, {
    timeout: 60000, // 1 minute for event operations
    maxRetries: 3,
    retryDelay: 1000,
  });
}

/**
 * Pre-built saga for event cancellation with refunds
 *
 * ✅ FIXED: Uses services/models instead of direct DB access
 *
 * Steps:
 * 1. Update event status to CANCELLING
 * 2. Stop ticket sales
 * 3. Notify ticket holders (async)
 * 4. Update event status to CANCELLED
 */
export function createEventCancellationSaga(): Saga<{
  eventId: string;
  tenantId: string;
  userId: string;
  reason: string;
  eventService: any; // ✅ FIXED: Use service instead of raw DB
  capacityService: any; // ✅ FIXED: Use service instead of raw DB
  notificationService?: any;
}> {
  return new Saga<{
    eventId: string;
    tenantId: string;
    userId: string;
    reason: string;
    eventService: any;
    capacityService: any;
    notificationService?: any;
  }>('event-cancellation', { timeout: 120000 })

    .addStep(
      'set-cancelling-status',
      async (ctx) => {
        // ✅ FIXED: Use eventService instead of direct DB
        const event = await ctx.eventService.updateStatus(
          ctx.eventId,
          ctx.tenantId,
          'CANCELLING',
          ctx.userId,
          { cancellation_reason: ctx.reason }
        );
        return { previousStatus: event.status };
      },
      async (ctx, data) => {
        // ✅ FIXED: Use eventService for compensation
        await ctx.eventService.updateStatus(
          ctx.eventId,
          ctx.tenantId,
          data.previousStatus,
          ctx.userId,
          { cancellation_reason: null }
        );
      }
    )

    .addStep(
      'stop-ticket-sales',
      async (ctx) => {
        // ✅ FIXED: Use capacityService instead of direct DB
        await ctx.capacityService.deactivateCapacity(ctx.eventId, ctx.tenantId);
        return { stopped: true };
      },
      async (ctx) => {
        // ✅ FIXED: Use capacityService for compensation
        await ctx.capacityService.activateCapacity(ctx.eventId, ctx.tenantId);
      }
    )

    .addStep(
      'queue-notifications',
      async (ctx) => {
        // Queue notifications asynchronously (don't wait for completion)
        if (ctx.notificationService) {
          await ctx.notificationService.queueCancellationNotifications(ctx.eventId, ctx.tenantId);
        } else {
          logger.warn({ eventId: ctx.eventId }, 'Notification service not available, skipping notifications');
        }
        return { queued: !!ctx.notificationService };
      },
      async () => {
        // Notifications are fire-and-forget, no compensation needed
      }
    )

    .addStep(
      'finalize-cancellation',
      async (ctx) => {
        // ✅ FIXED: Use eventService instead of direct DB
        await ctx.eventService.updateStatus(
          ctx.eventId,
          ctx.tenantId,
          'CANCELLED',
          ctx.userId,
          { cancelled_at: new Date() }
        );
        return { completed: true };
      },
      async (ctx) => {
        // ✅ FIXED: Use eventService for compensation
        await ctx.eventService.updateStatus(
          ctx.eventId,
          ctx.tenantId,
          'CANCELLING',
          ctx.userId,
          { cancelled_at: null }
        );
      }
    );
}
