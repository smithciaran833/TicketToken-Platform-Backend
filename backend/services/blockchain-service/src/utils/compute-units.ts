/**
 * Compute Unit Estimation Utility
 * 
 * AUDIT FIX #68: Add compute unit estimation for Solana transactions
 * 
 * Features:
 * - Uses simulateTransaction to estimate compute units
 * - Adds 20% buffer to estimated units
 * - Caps at MAX_COMPUTE_UNITS (1,400,000)
 * - Falls back to default if simulation fails
 * - Creates ComputeBudget instructions
 */

import {
  Connection,
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { logger } from './logger';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };

// =============================================================================
// CONFIGURATION
// =============================================================================

// Maximum compute units allowed by Solana
const MAX_COMPUTE_UNITS = 1_400_000;

// Default compute units if estimation fails
const DEFAULT_COMPUTE_UNITS = parseInt(
  process.env.DEFAULT_COMPUTE_UNITS || '200000',
  10
);

// Buffer multiplier (20% extra)
const COMPUTE_BUFFER_MULTIPLIER = 1.2;

// Minimum compute units to request
const MIN_COMPUTE_UNITS = 50_000;

// Default priority fee in micro-lamports per compute unit
const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = parseInt(
  process.env.DEFAULT_PRIORITY_FEE || '1000',
  10
);

// =============================================================================
// METRICS
// =============================================================================

interface ComputeMetrics {
  estimations: number;
  simulationFailures: number;
  averageComputeUnits: number;
  lastEstimation: number | null;
}

const metrics: ComputeMetrics = {
  estimations: 0,
  simulationFailures: 0,
  averageComputeUnits: DEFAULT_COMPUTE_UNITS,
  lastEstimation: null
};

/**
 * Get compute estimation metrics
 */
export function getComputeMetrics(): ComputeMetrics {
  return { ...metrics };
}

// =============================================================================
// ESTIMATION FUNCTIONS
// =============================================================================

export interface ComputeEstimation {
  computeUnits: number;
  withBuffer: number;
  wasSimulated: boolean;
  simulationError?: string;
}

/**
 * Estimate compute units for a transaction using simulation
 * AUDIT FIX #68: Use simulateTransaction for accurate estimation
 * 
 * @param connection - Solana connection
 * @param transaction - Transaction to estimate
 * @returns Estimated compute units with buffer
 */
export async function estimateComputeUnits(
  connection: Connection,
  transaction: Transaction | VersionedTransaction
): Promise<ComputeEstimation> {
  metrics.estimations++;
  
  try {
    // Simulate the transaction
    let simulation;
    
    if (transaction instanceof VersionedTransaction) {
      simulation = await connection.simulateTransaction(transaction, {
        sigVerify: false,
        replaceRecentBlockhash: true
      });
    } else {
      // For legacy transactions, ensure we have a recent blockhash
      if (!transaction.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
      }
      
      simulation = await connection.simulateTransaction(transaction);
    }
    
    // Check for simulation errors
    if (simulation.value.err) {
      const errorStr = JSON.stringify(simulation.value.err);
      logger.warn('Transaction simulation failed', {
        error: errorStr,
        logs: simulation.value.logs?.slice(-5) // Last 5 log lines
      });
      
      metrics.simulationFailures++;
      
      return {
        computeUnits: DEFAULT_COMPUTE_UNITS,
        withBuffer: Math.min(
          Math.ceil(DEFAULT_COMPUTE_UNITS * COMPUTE_BUFFER_MULTIPLIER),
          MAX_COMPUTE_UNITS
        ),
        wasSimulated: false,
        simulationError: errorStr
      };
    }
    
    // Extract compute units from simulation
    const unitsConsumed = simulation.value.unitsConsumed || DEFAULT_COMPUTE_UNITS;
    
    // Add 20% buffer
    const withBuffer = Math.min(
      Math.ceil(unitsConsumed * COMPUTE_BUFFER_MULTIPLIER),
      MAX_COMPUTE_UNITS
    );
    
    // Ensure minimum
    const finalUnits = Math.max(withBuffer, MIN_COMPUTE_UNITS);
    
    // Update metrics
    metrics.lastEstimation = finalUnits;
    metrics.averageComputeUnits = Math.round(
      (metrics.averageComputeUnits * (metrics.estimations - 1) + finalUnits) / metrics.estimations
    );
    
    logger.debug('Compute units estimated', {
      simulated: unitsConsumed,
      withBuffer: finalUnits,
      bufferPercent: Math.round((COMPUTE_BUFFER_MULTIPLIER - 1) * 100)
    });
    
    return {
      computeUnits: unitsConsumed,
      withBuffer: finalUnits,
      wasSimulated: true
    };
    
  } catch (error) {
    logger.error('Failed to estimate compute units', {
      error: (error as Error).message
    });
    
    metrics.simulationFailures++;
    
    // Fall back to default
    return {
      computeUnits: DEFAULT_COMPUTE_UNITS,
      withBuffer: Math.min(
        Math.ceil(DEFAULT_COMPUTE_UNITS * COMPUTE_BUFFER_MULTIPLIER),
        MAX_COMPUTE_UNITS
      ),
      wasSimulated: false,
      simulationError: (error as Error).message
    };
  }
}

// =============================================================================
// COMPUTE BUDGET INSTRUCTIONS
// =============================================================================

/**
 * Create compute budget instructions for a transaction
 * 
 * @param computeUnits - Compute unit limit
 * @param priorityFee - Priority fee in micro-lamports per CU (optional)
 * @returns Array of ComputeBudget instructions
 */
export function createComputeBudgetInstructions(
  computeUnits: number,
  priorityFee: number = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];
  
  // Set compute unit limit
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: Math.min(computeUnits, MAX_COMPUTE_UNITS)
    })
  );
  
  // Set priority fee if specified
  if (priorityFee > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee
      })
    );
  }
  
  return instructions;
}

/**
 * Prepend compute budget instructions to a transaction
 * AUDIT FIX #68: Add compute budget to all minting transactions
 * 
 * @param transaction - Transaction to modify
 * @param computeUnits - Compute unit limit
 * @param priorityFee - Priority fee in micro-lamports per CU (optional)
 */
export function addComputeBudget(
  transaction: Transaction,
  computeUnits: number,
  priorityFee: number = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS
): void {
  const budgetInstructions = createComputeBudgetInstructions(computeUnits, priorityFee);
  
  // Prepend to transaction (compute budget should be first)
  transaction.instructions = [
    ...budgetInstructions,
    ...transaction.instructions
  ];
  
  logger.debug('Compute budget added to transaction', {
    computeUnits,
    priorityFee,
    instructionCount: transaction.instructions.length
  });
}

/**
 * Estimate and add compute budget to a transaction
 * 
 * @param connection - Solana connection
 * @param transaction - Transaction to modify
 * @param priorityFee - Priority fee in micro-lamports per CU (optional)
 * @returns Estimation result
 */
export async function estimateAndAddComputeBudget(
  connection: Connection,
  transaction: Transaction,
  priorityFee: number = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS
): Promise<ComputeEstimation> {
  // First estimate without compute budget
  const estimation = await estimateComputeUnits(connection, transaction);
  
  // Add compute budget instructions
  addComputeBudget(transaction, estimation.withBuffer, priorityFee);
  
  return estimation;
}

// =============================================================================
// PRIORITY FEE UTILITIES
// =============================================================================

/**
 * Calculate priority fee based on network congestion
 * Higher fee during congestion for faster confirmation
 */
export async function calculatePriorityFee(
  connection: Connection,
  urgency: 'low' | 'medium' | 'high' = 'medium'
): Promise<number> {
  const multipliers = {
    low: 0.5,
    medium: 1.0,
    high: 2.0
  };
  
  try {
    // Get recent prioritization fees
    const recentFees = await connection.getRecentPrioritizationFees();
    
    if (recentFees.length === 0) {
      return DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS * multipliers[urgency];
    }
    
    // Calculate median fee
    const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
    const medianFee = fees[Math.floor(fees.length / 2)];
    
    // Apply urgency multiplier
    const suggestedFee = Math.ceil(medianFee * multipliers[urgency]);
    
    // Ensure minimum
    return Math.max(suggestedFee, 100);
    
  } catch (error) {
    logger.warn('Failed to get recent prioritization fees', {
      error: (error as Error).message
    });
    
    return DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS * multipliers[urgency];
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  MAX_COMPUTE_UNITS,
  DEFAULT_COMPUTE_UNITS,
  DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  COMPUTE_BUFFER_MULTIPLIER
};
