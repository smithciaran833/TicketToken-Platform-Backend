"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceController = exports.ComplianceController = void 0;
const fee_transparency_service_1 = require("../../services/compliance/fee-transparency.service");
const privacy_export_service_1 = require("../../services/compliance/privacy-export.service");
const logger_1 = require("../../utils/logger");
class ComplianceController {
    async getFeeBreakdown(req, reply) {
        try {
            const { basePrice, venueId, isResale, location } = req.query;
            const breakdown = await fee_transparency_service_1.feeTransparencyService.calculateFeeBreakdown(parseFloat(basePrice), venueId, isResale === 'true', location);
            reply.send({
                success: true,
                data: breakdown,
                disclaimer: 'All fees are shown in USD. Final price may vary based on location and applicable taxes.'
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get fee breakdown:', error);
            reply.status(500).send({ error: 'Failed to calculate fees' });
        }
    }
    async getOrderFees(req, reply) {
        try {
            const { orderId } = req.params;
            const userId = req.user.id;
            const order = await this.verifyOrderOwnership(orderId, userId);
            if (!order) {
                reply.status(403).send({ error: 'Access denied' });
                return;
            }
            const fees = await fee_transparency_service_1.feeTransparencyService.getOrderFees(orderId);
            reply.send({
                success: true,
                data: fees
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get order fees:', error);
            reply.status(500).send({ error: 'Failed to retrieve order fees' });
        }
    }
    async requestDataExport(req, reply) {
        try {
            const userId = req.user.id;
            const { reason } = req.body;
            const exportRequest = await privacy_export_service_1.privacyExportService.requestDataExport(userId, reason || 'User requested');
            reply.send({
                success: true,
                data: exportRequest,
                message: 'Your data export has been queued. You will receive an email when it\'s ready.'
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to request data export:', error);
            reply.status(500).send({ error: 'Failed to process export request' });
        }
    }
    async requestAccountDeletion(req, reply) {
        try {
            const userId = req.user.id;
            const { reason, confirmEmail } = req.body;
            if (confirmEmail !== req.user.email) {
                reply.status(400).send({ error: 'Email confirmation does not match' });
                return;
            }
            const deletionRequest = await privacy_export_service_1.privacyExportService.requestAccountDeletion(userId, reason);
            reply.send({
                success: true,
                data: deletionRequest,
                warning: 'Your account will be deleted in 30 days. You can cancel this request within 29 days.'
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to request account deletion:', error);
            reply.status(500).send({ error: 'Failed to process deletion request' });
        }
    }
    async getVenueFeeReport(req, reply) {
        try {
            const { venueId } = req.params;
            const { startDate, endDate } = req.query;
            const hasAccess = await this.verifyVenueAccess(venueId, req.user.id);
            if (!hasAccess) {
                reply.status(403).send({ error: 'Access denied' });
                return;
            }
            const report = await fee_transparency_service_1.feeTransparencyService.generateVenueFeeReport(venueId, new Date(startDate), new Date(endDate));
            reply.send({
                success: true,
                data: report
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to generate fee report:', error);
            reply.status(500).send({ error: 'Failed to generate report' });
        }
    }
    async getPrivacyPolicy(_req, reply) {
        reply.send({
            version: '2.0',
            effectiveDate: '2025-01-01',
            lastUpdated: '2025-08-10',
            dataCollection: {
                personal: ['name', 'email', 'phone', 'address'],
                payment: ['card last 4 digits', 'billing address'],
                usage: ['IP address', 'browser info', 'activity logs'],
                blockchain: ['wallet address', 'NFT ownership']
            },
            dataUsage: [
                'Process ticket purchases',
                'Mint NFT tickets',
                'Communicate about events',
                'Prevent fraud',
                'Comply with legal obligations'
            ],
            dataRetention: {
                transactional: '7 years',
                marketing: 'Until consent withdrawn',
                logs: '90 days'
            },
            userRights: [
                'Access your data (GDPR Article 15)',
                'Correct your data (GDPR Article 16)',
                'Delete your data (GDPR Article 17)',
                'Export your data (GDPR Article 20)',
                'Object to processing (GDPR Article 21)',
                'Withdraw consent anytime'
            ],
            contact: {
                email: 'privacy@tickettoken.com',
                dpo: 'dpo@tickettoken.com'
            }
        });
    }
    async verifyOrderOwnership(_orderId, _userId) {
        return true;
    }
    async verifyVenueAccess(_venueId, _userId) {
        return true;
    }
}
exports.ComplianceController = ComplianceController;
exports.complianceController = new ComplianceController();
//# sourceMappingURL=compliance.controller.js.map