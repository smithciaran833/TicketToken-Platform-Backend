/**
 * Transaction Simulation Utility
 * 
 * AUDIT FIX #83: Add transaction simulation before signing
 * 
 * Features:
 * - Simulate transactions before signing to detect errors
 * - Check program errors in logs
 * - Verify compute budget is sufficient
 * - Provide detailed error messages
 */

import { 
  Connection, 
  Transaction, 
  VersionedTransaction,
  SimulatedTransactionResponse,
  PublicKey,
  SendOptions
} from '@solana/web3.js';
import { logger } from './logger';
import { AlertType, AlertSeverity, createManualAlert } from './treasury-monitor';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };

// =============================================================================
// CONFIGURATION
// =============================================================================

// Whether to simulate before signing (default: true)
const SIMULATE_BEFORE_SIGN = process.env.TREASURY_SIMULATE_BEFORE_SIGN !== 'false';

// Default compute unit limit to check against
const DEFAULT_COMPUTE_BUDGET = parseInt(
  process.env.DEFAULT_COMPUTE_BUDGET || '400000',
  10
);

// Minimum remaining compute units (buffer)
const MIN_COMPUTE_BUFFER = parseInt(
  process.env.MIN_COMPUTE_BUFFER || '50000',
  10
);

// =============================================================================
// TYPES
// =============================================================================

export interface SimulationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  logs?: string[];
  unitsConsumed?: number;
  computeBudgetSufficient: boolean;
  accounts?: Array<{ pubkey: string; lamports: number }>;
  warnings: string[];
}

export interface SimulationOptions {
  skipSimulation?: boolean;
  computeBudget?: number;
  sigVerify?: boolean;
  replaceRecentBlockhash?: boolean;
}

// =============================================================================
// METRICS
// =============================================================================

interface SimulationMetrics {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  programErrors: number;
  computeErrors: number;
}

const metrics: SimulationMetrics = {
  total: 0,
  successful: 0,
  failed: 0,
  skipped: 0,
  programErrors: 0,
  computeErrors: 0
};

export function getSimulationMetrics(): SimulationMetrics {
  return { ...metrics };
}

// =============================================================================
// SIMULATION
// =============================================================================

/**
 * Simulate a transaction before signing
 * AUDIT FIX #83: Detect errors before spending SOL on fees
 * 
 * @param connection - Solana RPC connection
 * @param transaction - Transaction to simulate
 * @param options - Simulation options
 * @returns Simulation result with success/error details
 */
export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  options: SimulationOptions = {}
): Promise<SimulationResult> {
  const { 
    skipSimulation = false, 
    computeBudget = DEFAULT_COMPUTE_BUDGET,
    sigVerify = false,
    replaceRecentBlockhash = true
  } = options;

  metrics.total++;

  // Check if simulation is disabled
  if (!SIMULATE_BEFORE_SIGN || skipSimulation) {
    metrics.skipped++;
    logger.debug('Transaction simulation skipped', {
      reason: !SIMULATE_BEFORE_SIGN ? 'disabled' : 'flag',
      skipSimulation
    });
    return {
      success: true,
      computeBudgetSufficient: true,
      warnings: ['Simulation skipped - proceed with caution']
    };
  }

  try {
    logger.debug('Simulating transaction...');

    // Simulate the transaction
    let simulationResult: SimulatedTransactionResponse;
    
    if (transaction instanceof Transaction) {
      // Legacy transaction
      const response = await connection.simulateTransaction(transaction, {
        sigVerify,
        replaceRecentBlockhash,
        commitment: 'confirmed'
      });
      simulationResult = response.value;
    } else {
      // Versioned transaction
      const response = await connection.simulateTransaction(transaction, {
        sigVerify,
        replaceRecentBlockhash,
        commitment: 'confirmed'
      });
      simulationResult = response.value;
    }

    // Parse result
    const result = parseSimulationResult(simulationResult, computeBudget);

    if (result.success) {
      metrics.successful++;
      logger.info('Transaction simulation successful', {
        unitsConsumed: result.unitsConsumed,
        computeBudget,
        logsCount: result.logs?.length || 0
      });
    } else {
      metrics.failed++;
      
      // Track error type
      if (result.errorCode?.includes('Program') || result.error?.includes('program')) {
        metrics.programErrors++;
      }
      if (!result.computeBudgetSufficient) {
        metrics.computeErrors++;
      }

      logger.error('Transaction simulation failed', {
        error: result.error,
        errorCode: result.errorCode,
        unitsConsumed: result.unitsConsumed,
        logs: result.logs?.slice(-5) // Last 5 log lines
      });

      // Create alert for simulation failure
      await createManualAlert(
        AlertType.SIMULATION_FAILED,
        AlertSeverity.WARNING,
        `Transaction simulation failed: ${result.error}`,
        {
          errorCode: result.errorCode,
          unitsConsumed: result.unitsConsumed,
          logSample: result.logs?.slice(-3)
        }
      ).catch(() => {}); // Don't fail if alert fails
    }

    return result;

  } catch (error) {
    metrics.failed++;
    
    const errorMessage = (error as Error).message;
    
    logger.error('Transaction simulation error', {
      error: errorMessage
    });

    return {
      success: false,
      error: `Simulation error: ${errorMessage}`,
      computeBudgetSufficient: false,
      warnings: []
    };
  }
}

/**
 * Parse simulation response into structured result
 */
function parseSimulationResult(
  response: SimulatedTransactionResponse,
  computeBudget: number
): SimulationResult {
  const warnings: string[] = [];
  
  // Check for errors
  if (response.err) {
    const errorDetails = extractErrorDetails(response.err, response.logs);
    return {
      success: false,
      error: errorDetails.message,
      errorCode: errorDetails.code,
      logs: response.logs || undefined,
      unitsConsumed: response.unitsConsumed || undefined,
      computeBudgetSufficient: false,
      warnings
    };
  }

  // Check compute units consumed
  const unitsConsumed = response.unitsConsumed || 0;
  const computeBudgetSufficient = unitsConsumed + MIN_COMPUTE_BUFFER <= computeBudget;

  if (!computeBudgetSufficient) {
    warnings.push(
      `Compute units consumed (${unitsConsumed}) close to budget (${computeBudget}). ` +
      `Consider increasing compute budget.`
    );
  }

  // Check logs for warnings
  if (response.logs) {
    for (const log of response.logs) {
      if (log.toLowerCase().includes('warning')) {
        warnings.push(`Log warning: ${log}`);
      }
      if (log.includes('exceeded') || log.includes('limit')) {
        warnings.push(`Potential limit issue: ${log}`);
      }
    }
  }

  return {
    success: true,
    logs: response.logs || undefined,
    unitsConsumed,
    computeBudgetSufficient,
    accounts: response.accounts?.map((acc, idx) => ({
      pubkey: `account_${idx}`,
      lamports: acc?.lamports || 0
    })),
    warnings
  };
}

/**
 * Extract meaningful error details from simulation error
 */
function extractErrorDetails(
  err: any,
  logs?: string[] | null
): { message: string; code?: string } {
  // Handle different error formats
  if (typeof err === 'string') {
    return { message: err };
  }

  if (typeof err === 'object') {
    // InstructionError format: { InstructionError: [index, error] }
    if (err.InstructionError) {
      const [index, error] = err.InstructionError;
      let errorMessage: string;
      
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.Custom !== undefined) {
        errorMessage = `Custom program error: ${error.Custom}`;
      } else {
        errorMessage = JSON.stringify(error);
      }

      return {
        message: `Instruction ${index} failed: ${errorMessage}`,
        code: `INSTRUCTION_ERROR_${index}`
      };
    }

    // Other error formats
    if (err.message) {
      return { message: err.message, code: err.code };
    }
  }

  // Try to extract error from logs
  if (logs) {
    for (const log of logs.reverse()) {
      if (log.includes('Error:') || log.includes('failed:')) {
        return { message: log };
      }
      if (log.includes('Program failed')) {
        return { message: log, code: 'PROGRAM_FAILED' };
      }
    }
  }

  return { message: `Unknown error: ${JSON.stringify(err)}` };
}

// =============================================================================
// HIGHER-LEVEL FUNCTIONS
// =============================================================================

/**
 * Simulate and sign transaction if successful
 * Throws if simulation fails
 */
export async function simulateBeforeSigning(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  options: SimulationOptions = {}
): Promise<SimulationResult> {
  const result = await simulateTransaction(connection, transaction, options);
  
  if (!result.success) {
    throw new Error(
      `Transaction simulation failed: ${result.error}` +
      (result.errorCode ? ` (${result.errorCode})` : '') +
      '\nSimulation must pass before signing.'
    );
  }

  if (result.warnings.length > 0) {
    logger.warn('Transaction simulation passed with warnings', {
      warnings: result.warnings
    });
  }

  return result;
}

/**
 * Check if a transaction would exceed compute budget
 */
export async function checkComputeBudget(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  requestedBudget: number
): Promise<{
  sufficient: boolean;
  consumed: number;
  recommended: number;
}> {
  const result = await simulateTransaction(connection, transaction, {
    computeBudget: requestedBudget
  });

  const consumed = result.unitsConsumed || 0;
  const recommended = Math.ceil(consumed * 1.2); // 20% buffer

  return {
    sufficient: result.computeBudgetSufficient,
    consumed,
    recommended
  };
}

/**
 * Validate transaction before sending
 * Returns all validation issues
 */
export async function validateTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  options: SimulationOptions = {}
): Promise<{
  valid: boolean;
  issues: string[];
  simulation: SimulationResult;
}> {
  const issues: string[] = [];

  // Simulate
  const simulation = await simulateTransaction(connection, transaction, options);

  if (!simulation.success) {
    issues.push(`Simulation failed: ${simulation.error}`);
  }

  if (!simulation.computeBudgetSufficient) {
    issues.push(
      `Compute budget may be insufficient. ` +
      `Consumed: ${simulation.unitsConsumed}, Budget: ${options.computeBudget || DEFAULT_COMPUTE_BUDGET}`
    );
  }

  issues.push(...simulation.warnings);

  return {
    valid: issues.length === 0,
    issues,
    simulation
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { 
  SIMULATE_BEFORE_SIGN,
  DEFAULT_COMPUTE_BUDGET,
  MIN_COMPUTE_BUFFER
};
