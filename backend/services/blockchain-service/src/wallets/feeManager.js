const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const config = require('../config');

class FeeManager {
    constructor(connection) {
        this.connection = connection;
        this.fees = config.fees;
    }
    
    calculateMintingFee() {
        return {
            rentExemption: this.fees.rentExemption,
            transactionFee: this.fees.transactionFee,
            priorityFee: this.fees.priorityFee,
            total: this.fees.rentExemption + this.fees.transactionFee + this.fees.priorityFee,
            totalLamports: Math.ceil((this.fees.rentExemption + this.fees.transactionFee + this.fees.priorityFee) * LAMPORTS_PER_SOL)
        };
    }
    
    calculateTransferFee() {
        return {
            transactionFee: this.fees.transactionFee,
            priorityFee: this.fees.priorityFee,
            total: this.fees.transactionFee + this.fees.priorityFee,
            totalLamports: Math.ceil((this.fees.transactionFee + this.fees.priorityFee) * LAMPORTS_PER_SOL)
        };
    }
    
    calculateBurnFee() {
        return {
            transactionFee: this.fees.transactionFee,
            priorityFee: this.fees.priorityFee,
            total: this.fees.transactionFee + this.fees.priorityFee,
            totalLamports: Math.ceil((this.fees.transactionFee + this.fees.priorityFee) * LAMPORTS_PER_SOL)
        };
    }
    
    async getOptimalPriorityFee() {
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
    
    async ensureSufficientBalance(publicKey, requiredSol) {
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
    
    formatFeeBreakdown(fees) {
        const lines = [];
        lines.push('Fee Breakdown:');
        lines.push(`  Rent Exemption: ${fees.rentExemption || 0} SOL`);
        lines.push(`  Transaction Fee: ${fees.transactionFee || 0} SOL`);
        lines.push(`  Priority Fee: ${fees.priorityFee || 0} SOL`);
        lines.push(`  Total: ${fees.total || 0} SOL`);
        return lines.join('\n');
    }
}

module.exports = FeeManager;
