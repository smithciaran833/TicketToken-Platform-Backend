"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeManager = void 0;
const web3_js_1 = require("@solana/web3.js");
const config_1 = __importDefault(require("../config"));
class FeeManager {
    connection;
    fees;
    constructor(connection) {
        this.connection = connection;
        this.fees = config_1.default.fees;
    }
    calculateMintingFee() {
        return {
            rentExemption: this.fees.rentExemption,
            transactionFee: this.fees.transactionFee,
            priorityFee: this.fees.priorityFee,
            total: this.fees.rentExemption + this.fees.transactionFee + this.fees.priorityFee,
            totalLamports: Math.ceil((this.fees.rentExemption + this.fees.transactionFee + this.fees.priorityFee) * web3_js_1.LAMPORTS_PER_SOL)
        };
    }
    calculateTransferFee() {
        return {
            transactionFee: this.fees.transactionFee,
            priorityFee: this.fees.priorityFee,
            total: this.fees.transactionFee + this.fees.priorityFee,
            totalLamports: Math.ceil((this.fees.transactionFee + this.fees.priorityFee) * web3_js_1.LAMPORTS_PER_SOL)
        };
    }
    calculateBurnFee() {
        return {
            transactionFee: this.fees.transactionFee,
            priorityFee: this.fees.priorityFee,
            total: this.fees.transactionFee + this.fees.priorityFee,
            totalLamports: Math.ceil((this.fees.transactionFee + this.fees.priorityFee) * web3_js_1.LAMPORTS_PER_SOL)
        };
    }
    async getOptimalPriorityFee() {
        try {
            const recentFees = await this.connection.getRecentPrioritizationFees();
            if (!recentFees || recentFees.length === 0) {
                return this.fees.priorityFee * web3_js_1.LAMPORTS_PER_SOL;
            }
            const fees = recentFees
                .map(f => f.prioritizationFee)
                .filter(f => f > 0)
                .sort((a, b) => a - b);
            if (fees.length === 0) {
                return this.fees.priorityFee * web3_js_1.LAMPORTS_PER_SOL;
            }
            const medianFee = fees[Math.floor(fees.length / 2)];
            const MAX_PRIORITY_FEE = 0.001 * web3_js_1.LAMPORTS_PER_SOL;
            return Math.min(medianFee, MAX_PRIORITY_FEE);
        }
        catch (error) {
            console.error('Failed to get optimal priority fee:', error);
            return this.fees.priorityFee * web3_js_1.LAMPORTS_PER_SOL;
        }
    }
    async ensureSufficientBalance(publicKey, requiredSol) {
        const balance = await this.connection.getBalance(publicKey);
        const balanceSol = balance / web3_js_1.LAMPORTS_PER_SOL;
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
exports.FeeManager = FeeManager;
exports.default = FeeManager;
//# sourceMappingURL=feeManager.js.map