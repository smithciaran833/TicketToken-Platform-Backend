"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feeTransparencyService = exports.FeeTransparencyService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../utils/logger");
class FeeTransparencyService {
    async calculateFeeBreakdown(basePrice, venueId, isResale = false, location) {
        try {
            const venuePolicy = await this.getVenueFeePolicy(venueId);
            const platformFeePercent = isResale ? 2.5 : 3.5;
            const platformFee = Math.round(basePrice * platformFeePercent / 100);
            const venueFeePercent = isResale ?
                venuePolicy.resaleFeePercent :
                venuePolicy.baseFeePercent;
            const venueFee = Math.round(basePrice * venueFeePercent / 100);
            const paymentProcessingPercent = 2.9;
            const paymentProcessingFee = Math.round(basePrice * paymentProcessingPercent / 100) + 30;
            const taxPercent = this.getTaxRate(location);
            const subtotal = basePrice + platformFee + venueFee + paymentProcessingFee;
            const taxAmount = Math.round(subtotal * taxPercent / 100);
            const totalPrice = subtotal + taxAmount;
            return {
                basePrice,
                platformFee,
                platformFeePercent,
                venueFee,
                venueFeePercent,
                paymentProcessingFee,
                paymentProcessingPercent,
                taxAmount,
                taxPercent,
                totalPrice,
                currency: 'USD'
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to calculate fee breakdown:', error);
            throw error;
        }
    }
    async getVenueFeePolicy(venueId) {
        const policy = await (0, database_1.db)('venue_fee_policies')
            .where({ venue_id: venueId, active: true })
            .first();
        if (!policy) {
            return {
                venueId,
                venueName: 'Venue',
                baseFeePercent: 5.0,
                serviceFeePercent: 2.5,
                resaleFeePercent: 5.0,
                effectiveDate: new Date(),
                lastUpdated: new Date()
            };
        }
        return {
            venueId: policy.venue_id,
            venueName: policy.venue_name,
            baseFeePercent: parseFloat(policy.base_fee_percent),
            serviceFeePercent: parseFloat(policy.service_fee_percent),
            resaleFeePercent: parseFloat(policy.resale_fee_percent),
            maxResalePrice: policy.max_resale_price,
            effectiveDate: policy.effective_date,
            lastUpdated: policy.updated_at
        };
    }
    async getOrderFees(orderId) {
        const fees = await (0, database_1.db)('order_fees')
            .where({ order_id: orderId })
            .first();
        if (!fees) {
            throw new Error('Order fees not found');
        }
        return {
            orderId,
            breakdown: {
                tickets: fees.base_amount / 100,
                platformFee: fees.platform_fee / 100,
                venueFee: fees.venue_fee / 100,
                processingFee: fees.processing_fee / 100,
                tax: fees.tax_amount / 100,
                total: fees.total_amount / 100
            },
            currency: fees.currency,
            paidAt: fees.created_at
        };
    }
    async generateVenueFeeReport(venueId, startDate, endDate) {
        const report = await (0, database_1.db)('order_fees')
            .where({ venue_id: venueId })
            .whereBetween('created_at', [startDate, endDate])
            .select(database_1.db.raw('SUM(base_amount) as total_sales'), database_1.db.raw('SUM(venue_fee) as total_venue_fees'), database_1.db.raw('SUM(platform_fee) as total_platform_fees'), database_1.db.raw('COUNT(*) as transaction_count'), database_1.db.raw('AVG(venue_fee) as avg_venue_fee'))
            .first();
        const breakdown = await (0, database_1.db)('order_fees')
            .where({ venue_id: venueId })
            .whereBetween('created_at', [startDate, endDate])
            .select(database_1.db.raw('DATE(created_at) as date'), database_1.db.raw('SUM(venue_fee) as daily_fees'), database_1.db.raw('COUNT(*) as transactions'))
            .groupBy(database_1.db.raw('DATE(created_at)'))
            .orderBy('date', 'asc');
        return {
            venueId,
            period: {
                start: startDate,
                end: endDate
            },
            summary: {
                totalSales: (report.total_sales || 0) / 100,
                totalVenueFees: (report.total_venue_fees || 0) / 100,
                totalPlatformFees: (report.total_platform_fees || 0) / 100,
                transactionCount: report.transaction_count || 0,
                averageFeePerTransaction: (report.avg_venue_fee || 0) / 100
            },
            dailyBreakdown: breakdown.map((day) => ({
                date: day.date,
                fees: day.daily_fees / 100,
                transactions: day.transactions
            }))
        };
    }
    getTaxRate(location) {
        const taxRates = {
            'CA': 8.5,
            'NY': 8.0,
            'TX': 6.25,
            'FL': 6.0,
            'WA': 6.5
        };
        return taxRates[location || 'NY'] || 7.0;
    }
}
exports.FeeTransparencyService = FeeTransparencyService;
exports.feeTransparencyService = new FeeTransparencyService();
//# sourceMappingURL=fee-transparency.service.js.map