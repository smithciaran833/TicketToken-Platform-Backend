import { logger } from './logger';

export interface SagaStep<T = any> {
  name: string;
  execute: () => Promise<T>;
  compensate: (result?: T) => Promise<void>;
}

export interface SagaResult<T = any> {
  success: boolean;
  results: T[];
  error?: Error;
  compensated: boolean;
}

export class SagaCoordinator {
  private executedSteps: Array<{ name: string; result: any }> = [];

  async executeSaga<T = any>(steps: SagaStep[]): Promise<SagaResult<T>> {
    try {
      const results: T[] = [];

      for (const step of steps) {
        logger.info(`Executing saga step: ${step.name}`);
        const result = await step.execute();
        this.executedSteps.push({ name: step.name, result });
        results.push(result);
        logger.info(`Saga step completed: ${step.name}`);
      }

      return {
        success: true,
        results,
        compensated: false,
      };
    } catch (error) {
      logger.error('Saga execution failed, starting compensation', { error });
      await this.compensate(steps);
      
      return {
        success: false,
        results: [],
        error: error as Error,
        compensated: true,
      };
    }
  }

  private async compensate(steps: SagaStep[]): Promise<void> {
    // Compensate in reverse order
    for (let i = this.executedSteps.length - 1; i >= 0; i--) {
      const executedStep = this.executedSteps[i];
      const step = steps.find((s) => s.name === executedStep.name);

      if (step) {
        try {
          logger.info(`Compensating saga step: ${step.name}`);
          await step.compensate(executedStep.result);
          logger.info(`Compensation completed: ${step.name}`);
        } catch (compensationError) {
          logger.error(`Compensation failed for step: ${step.name}`, {
            error: compensationError,
          });
          // Continue compensating other steps even if one fails
        }
      }
    }
  }

  reset(): void {
    this.executedSteps = [];
  }
}
