import { Knex } from 'knex';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'VenueOperationsService' });

/**
 * SECURITY FIX (VO5-VO7): Venue operations with recovery points, resume capability, and tenant scoping
 * - VO5: Recovery points for long-running operations
 * - VO6: Resume capability for failed operations
 * - VO7: Tenant scoping for all operations
 */

export type OperationStatus = 'pending' | 'in_progress' | 'checkpoint' | 'completed' | 'failed' | 'rolled_back';

export interface OperationStep {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
  rollbackData?: any;
}

export interface VenueOperation {
  id: string;
  operation_type: string;
  venue_id: string;
  tenant_id: string;
  status: OperationStatus;
  current_step: number;
  total_steps: number;
  steps: OperationStep[];
  checkpoint_data?: any;
  started_at: Date;
  updated_at: Date;
  completed_at?: Date;
  error_message?: string;
  created_by?: string;
  correlation_id?: string;
}

export interface OperationContext {
  operationId: string;
  venueId: string;
  tenantId: string;
  correlationId: string;
  checkpoint: (stepName: string, data: any) => Promise<void>;
  getCheckpoint: (stepName: string) => any;
}

export interface OperationStepDefinition {
  name: string;
  execute: (context: OperationContext, input: any) => Promise<any>;
  rollback?: (context: OperationContext, checkpointData: any) => Promise<void>;
  canResume?: boolean;
}

/**
 * SECURITY FIX (VO5-VO7): Service for managing long-running venue operations
 */
export class VenueOperationsService {
  private readonly operationsTable = 'venue_operations';
  private readonly lockPrefix = 'venue:operation:lock:';
  private readonly lockTtl = 60000; // 60 seconds

  constructor(
    private readonly db: Knex,
    private readonly redis: Redis
  ) {}

  /**
   * SECURITY FIX (VO7): Validate tenant context before any operation
   */
  private validateTenantContext(tenantId: string): void {
    if (!tenantId) {
      throw new Error('Tenant context required for venue operations');
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
  }

  /**
   * SECURITY FIX (VO7): Set RLS context for database operations
   */
  private async setTenantContext(trx: Knex.Transaction, tenantId: string): Promise<void> {
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  }

  /**
   * Acquire distributed lock for operation
   */
  private async acquireLock(venueId: string, operationType: string): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${venueId}:${operationType}`;
    const lockValue = `${process.pid}:${Date.now()}`;
    
    try {
      const result = await this.redis.set(lockKey, lockValue, 'PX', this.lockTtl, 'NX');
      return result === 'OK';
    } catch (error: any) {
      log.error({ venueId, operationType, error: error.message }, 'Error acquiring operation lock');
      return true; // Fail open
    }
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(venueId: string, operationType: string): Promise<void> {
    const lockKey = `${this.lockPrefix}${venueId}:${operationType}`;
    try {
      await this.redis.del(lockKey);
    } catch (error: any) {
      log.warn({ venueId, operationType, error: error.message }, 'Error releasing operation lock');
    }
  }

  /**
   * SECURITY FIX (VO5): Create operation with recovery points
   */
  async createOperation(
    venueId: string,
    tenantId: string,
    operationType: string,
    steps: string[],
    createdBy?: string,
    correlationId?: string
  ): Promise<VenueOperation> {
    this.validateTenantContext(tenantId);

    const operationId = randomUUID();
    const operation: VenueOperation = {
      id: operationId,
      operation_type: operationType,
      venue_id: venueId,
      tenant_id: tenantId,
      status: 'pending',
      current_step: 0,
      total_steps: steps.length,
      steps: steps.map(name => ({
        name,
        status: 'pending',
      })),
      started_at: new Date(),
      updated_at: new Date(),
      created_by: createdBy,
      correlation_id: correlationId,
    };

    // Check if there's already a pending/in_progress operation
    const existingOp = await this.db(this.operationsTable)
      .where({
        venue_id: venueId,
        tenant_id: tenantId,
        operation_type: operationType,
      })
      .whereIn('status', ['pending', 'in_progress', 'checkpoint'])
      .first();

    if (existingOp) {
      throw new Error(`Operation ${operationType} already in progress for venue ${venueId}`);
    }

    await this.db(this.operationsTable).insert({
      id: operation.id,
      operation_type: operation.operation_type,
      venue_id: operation.venue_id,
      tenant_id: operation.tenant_id,
      status: operation.status,
      current_step: operation.current_step,
      total_steps: operation.total_steps,
      steps: JSON.stringify(operation.steps),
      started_at: operation.started_at,
      updated_at: operation.updated_at,
      created_by: operation.created_by,
      correlation_id: operation.correlation_id,
    });

    log.info({ operationId, venueId, tenantId, operationType, totalSteps: steps.length }, 'Created operation');
    return operation;
  }

  /**
   * SECURITY FIX (VO5): Save checkpoint for recovery
   */
  async checkpoint(
    operationId: string,
    tenantId: string,
    stepName: string,
    checkpointData: any
  ): Promise<void> {
    this.validateTenantContext(tenantId);

    const operation = await this.getOperation(operationId, tenantId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    const stepIndex = operation.steps.findIndex(s => s.name === stepName);
    if (stepIndex === -1) {
      throw new Error(`Step ${stepName} not found in operation`);
    }

    operation.steps[stepIndex].result = checkpointData;
    operation.checkpoint_data = {
      ...(operation.checkpoint_data || {}),
      [stepName]: checkpointData,
    };
    operation.status = 'checkpoint';
    operation.updated_at = new Date();

    await this.db(this.operationsTable)
      .where({ id: operationId, tenant_id: tenantId })
      .update({
        steps: JSON.stringify(operation.steps),
        checkpoint_data: JSON.stringify(operation.checkpoint_data),
        status: operation.status,
        updated_at: operation.updated_at,
      });

    log.info({ operationId, stepName, tenantId }, 'Saved operation checkpoint');
  }

  /**
   * SECURITY FIX (VO6): Get operation with resume data
   */
  async getOperation(operationId: string, tenantId: string): Promise<VenueOperation | null> {
    this.validateTenantContext(tenantId);

    const row = await this.db(this.operationsTable)
      .where({ id: operationId, tenant_id: tenantId })
      .first();

    if (!row) return null;

    return {
      ...row,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      checkpoint_data: row.checkpoint_data
        ? (typeof row.checkpoint_data === 'string' ? JSON.parse(row.checkpoint_data) : row.checkpoint_data)
        : undefined,
    };
  }

  /**
   * SECURITY FIX (VO6): Execute operation with resume capability
   */
  async executeOperation(
    operationId: string,
    tenantId: string,
    stepDefinitions: OperationStepDefinition[],
    input: any
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    this.validateTenantContext(tenantId);

    const operation = await this.getOperation(operationId, tenantId);
    if (!operation) {
      return { success: false, error: 'Operation not found' };
    }

    // Acquire lock
    const lockAcquired = await this.acquireLock(operation.venue_id, operation.operation_type);
    if (!lockAcquired) {
      return { success: false, error: 'Operation already in progress' };
    }

    try {
      // Find resume point if resuming
      let startStep = 0;
      if (operation.status === 'checkpoint' || operation.status === 'failed') {
        startStep = operation.steps.findIndex(s => s.status !== 'completed');
        if (startStep === -1) startStep = 0;
        log.info({ operationId, startStep, status: operation.status }, 'Resuming operation');
      }

      // Update status to in_progress
      await this.updateOperationStatus(operationId, tenantId, 'in_progress');

      const context: OperationContext = {
        operationId,
        venueId: operation.venue_id,
        tenantId,
        correlationId: operation.correlation_id || operationId,
        checkpoint: async (stepName: string, data: any) => {
          await this.checkpoint(operationId, tenantId, stepName, data);
        },
        getCheckpoint: (stepName: string) => {
          return operation.checkpoint_data?.[stepName];
        },
      };

      let result: any;

      // Execute steps
      for (let i = startStep; i < stepDefinitions.length; i++) {
        const stepDef = stepDefinitions[i];
        const step = operation.steps[i];

        if (!step) {
          throw new Error(`Step ${i} not found in operation`);
        }

        // Skip completed steps
        if (step.status === 'completed') {
          log.debug({ operationId, step: stepDef.name }, 'Skipping completed step');
          continue;
        }

        try {
          step.status = 'in_progress';
          step.startedAt = new Date();
          await this.updateOperationSteps(operationId, tenantId, operation.steps, i);

          log.info({ operationId, step: stepDef.name, stepIndex: i }, 'Executing step');
          result = await stepDef.execute(context, input);

          step.status = 'completed';
          step.completedAt = new Date();
          step.result = result;
          await this.updateOperationSteps(operationId, tenantId, operation.steps, i + 1);

          log.info({ operationId, step: stepDef.name }, 'Step completed');
        } catch (error: any) {
          step.status = 'failed';
          step.error = error.message;
          await this.updateOperationSteps(operationId, tenantId, operation.steps, i);

          log.error({ operationId, step: stepDef.name, error: error.message }, 'Step failed');

          // Attempt rollback if available
          if (stepDef.rollback && step.result) {
            try {
              log.info({ operationId, step: stepDef.name }, 'Attempting rollback');
              await stepDef.rollback(context, step.result);
            } catch (rollbackError: any) {
              log.error({ operationId, step: stepDef.name, error: rollbackError.message }, 'Rollback failed');
            }
          }

          await this.updateOperationStatus(operationId, tenantId, 'failed', error.message);
          return { success: false, error: error.message };
        }
      }

      await this.updateOperationStatus(operationId, tenantId, 'completed');
      return { success: true, result };

    } finally {
      await this.releaseLock(operation.venue_id, operation.operation_type);
    }
  }

  /**
   * Update operation status
   */
  private async updateOperationStatus(
    operationId: string,
    tenantId: string,
    status: OperationStatus,
    errorMessage?: string
  ): Promise<void> {
    const update: any = {
      status,
      updated_at: new Date(),
    };
    
    if (status === 'completed') {
      update.completed_at = new Date();
    }
    
    if (errorMessage) {
      update.error_message = errorMessage;
    }

    await this.db(this.operationsTable)
      .where({ id: operationId, tenant_id: tenantId })
      .update(update);
  }

  /**
   * Update operation steps and current step
   */
  private async updateOperationSteps(
    operationId: string,
    tenantId: string,
    steps: OperationStep[],
    currentStep: number
  ): Promise<void> {
    await this.db(this.operationsTable)
      .where({ id: operationId, tenant_id: tenantId })
      .update({
        steps: JSON.stringify(steps),
        current_step: currentStep,
        updated_at: new Date(),
      });
  }

  /**
   * SECURITY FIX (VO6): Get resumable operations for a venue
   */
  async getResumableOperations(venueId: string, tenantId: string): Promise<VenueOperation[]> {
    this.validateTenantContext(tenantId);

    const rows = await this.db(this.operationsTable)
      .where({ venue_id: venueId, tenant_id: tenantId })
      .whereIn('status', ['checkpoint', 'failed'])
      .orderBy('updated_at', 'desc');

    return rows.map(row => ({
      ...row,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      checkpoint_data: row.checkpoint_data
        ? (typeof row.checkpoint_data === 'string' ? JSON.parse(row.checkpoint_data) : row.checkpoint_data)
        : undefined,
    }));
  }

  /**
   * Get operation history for a venue
   */
  async getOperationHistory(
    venueId: string,
    tenantId: string,
    limit: number = 50
  ): Promise<VenueOperation[]> {
    this.validateTenantContext(tenantId);

    const rows = await this.db(this.operationsTable)
      .where({ venue_id: venueId, tenant_id: tenantId })
      .orderBy('started_at', 'desc')
      .limit(limit);

    return rows.map(row => ({
      ...row,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      checkpoint_data: row.checkpoint_data
        ? (typeof row.checkpoint_data === 'string' ? JSON.parse(row.checkpoint_data) : row.checkpoint_data)
        : undefined,
    }));
  }

  /**
   * Cancel a pending operation
   */
  async cancelOperation(operationId: string, tenantId: string): Promise<void> {
    this.validateTenantContext(tenantId);

    const operation = await this.getOperation(operationId, tenantId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    if (!['pending', 'checkpoint', 'failed'].includes(operation.status)) {
      throw new Error(`Cannot cancel operation in status: ${operation.status}`);
    }

    await this.db(this.operationsTable)
      .where({ id: operationId, tenant_id: tenantId })
      .update({
        status: 'rolled_back',
        updated_at: new Date(),
        error_message: 'Operation cancelled by user',
      });

    log.info({ operationId, tenantId }, 'Operation cancelled');
  }
}

/**
 * Factory function to create VenueOperationsService
 */
export function createVenueOperationsService(db: Knex, redis: Redis): VenueOperationsService {
  return new VenueOperationsService(db, redis);
}
