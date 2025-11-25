import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import config from '../config';

interface FeeBreakdown {
  rentExemption?: number;
  transactionFee: number;
  priorityFee: number;
  total: number;
  totalLamports: number;
}

interface BalanceCheck {
  sufficient: boolean;
  required: number;
  actual: number;
  shortfall?: number;
  surplus?: number;
}

export class FeeManager {
  private connection: Connection;
  private fees: any;

  constructor(connection: Connection) {
    this.connection = connection;
//     this.fees = config.fees;
  }

  calculateMintingFee(): FeeBreakdown {
    return {
      rentExemption: this.fees.rentExemption,
      transactionFee: this.fees.transactionFee,
      priorityFee: this.fees.priorityFee,
      total: this.fees.rentExemption + this.fees.transactionFee + this.fees.priorityFee,
      totalLamports: Math.ceil((this.fees.rentExemption + this.fees.transactionFee + this.fees.priorityFee) * LAMPORTS_PER_SOL)
    };
  }

  calculateTransferFee(): FeeBreakdown {
    return {
      transactionFee: this.fees.transactionFee,
      priorityFee: this.fees.priorityFee,
      total: this.fees.transactionFee + this.fees.priorityFee,
      totalLamports: Math.ceil((this.fees.transactionFee + this.fees.priorityFee) * LAMPORTS_PER_SOL)
    };
  }

  calculateBurnFee(): FeeBreakdown {
    return {
      transactionFee: this.fees.transactionFee,
      priorityFee: this.fees.priorityFee,
      total: this.fees.transactionFee + this.fees.priorityFee,
      totalLamports: Math.ceil((this.fees.transactionFee + this.fees.priorityFee) * LAMPORTS_PER_SOL)
    };
  }

  async getOptimalPriorityFee(): Promise<number> {
    try {
      // Get recent priority fees from network
      const recentFees = await this.connection.getRecentPrioritizationFees();

      if (!recentFees || recentFees.length === 0) {
        return this.fees.priorityFee * LAMPORTS_PER_SOL;
      }

      // Calculate median fee
      const fees = recentFees
        .map(f => f.prioritizationFee)
        .filter(f => f > 0)
        .sort((a, b) => a - b);

      if (fees.length === 0) {
        return this.fees.priorityFee * LAMPORTS_PER_SOL;
      }

      const medianFee = fees[Math.floor(fees.length / 2)];

      // Cap at maximum we're willing to pay
      const MAX_PRIORITY_FEE = 0.001 * LAMPORTS_PER_SOL;
      return Math.min(medianFee, MAX_PRIORITY_FEE);

    } catch (error) {
      console.error('Failed to get optimal priority fee:', error);
      return this.fees.priorityFee * LAMPORTS_PER_SOL;
    }
  }

  async ensureSufficientBalance(publicKey: PublicKey, requiredSol: number): Promise<BalanceCheck> {
    const balance = await this.connection.getBalance(publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;

    if (balanceSol < requiredSol) {
      return {
        sufficient: false,
        required: requiredSol,
        actual: balanceSol,
        shortfall: requiredSol - balanceSol
      };
    }

    return {
      sufficient: true,
      required: requiredSol,
      actual: balanceSol,
      surplus: balanceSol - requiredSol
    };
  }

  formatFeeBreakdown(fees: FeeBreakdown): string {
    const lines = [];
    lines.push('Fee Breakdown:');
    lines.push(`  Rent Exemption: ${fees.rentExemption || 0} SOL`);
    lines.push(`  Transaction Fee: ${fees.transactionFee || 0} SOL`);
    lines.push(`  Priority Fee: ${fees.priorityFee || 0} SOL`);
    lines.push(`  Total: ${fees.total || 0} SOL`);
    return lines.join('\n');
  }
}

export default FeeManager;
