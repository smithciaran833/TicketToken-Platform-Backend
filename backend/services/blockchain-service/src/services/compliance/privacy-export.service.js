"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.privacyExportService = exports.PrivacyExportService = void 0;
const database_1 = require("../../config/database");
const logger_1 = require("../../utils/logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const archiver_1 = __importDefault(require("archiver"));
const crypto_1 = __importDefault(require("crypto"));
class PrivacyExportService {
    exportPath = process.env.EXPORT_PATH || '/tmp/exports';
    async requestDataExport(userId, reason) {
        try {
            const requestId = crypto_1.default.randomUUID();
            await (0, database_1.db)('privacy_export_requests').insert({
                id: requestId,
                user_id: userId,
                reason,
                status: 'pending',
                requested_at: new Date()
            });
            this.processExportAsync(requestId, userId);
            return {
                requestId,
                userId,
                requestedAt: new Date(),
                status: 'pending'
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create export request:', error);
            throw error;
        }
    }
    async processExportAsync(requestId, userId) {
        try {
            await (0, database_1.db)('privacy_export_requests')
                .where({ id: requestId })
                .update({ status: 'processing' });
            const userData = await this.collectUserData(userId);
            const exportFile = await this.createExportArchive(userId, userData);
            const downloadUrl = await this.generateDownloadUrl(exportFile);
            await (0, database_1.db)('privacy_export_requests')
                .where({ id: requestId })
                .update({
                status: 'completed',
                completed_at: new Date(),
                download_url: downloadUrl,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            await this.notifyUserExportReady(userId, downloadUrl);
        }
        catch (error) {
            logger_1.logger.error('Export processing failed:', error);
            await (0, database_1.db)('privacy_export_requests')
                .where({ id: requestId })
                .update({
                status: 'failed',
                error_message: error.message
            });
        }
    }
    async collectUserData(userId) {
        const data = {};
        data.profile = await (0, database_1.db)('users')
            .where({ id: userId })
            .select('id', 'email', 'name', 'phone', 'created_at', 'last_login')
            .first();
        data.purchases = await (0, database_1.db)('orders')
            .where({ customer_id: userId })
            .select('id', 'event_id', 'ticket_count', 'total_amount', 'status', 'created_at');
        data.tickets = await (0, database_1.db)('tickets')
            .where({ owner_id: userId })
            .select('id', 'event_id', 'seat_number', 'price', 'status', 'created_at');
        data.nfts = await (0, database_1.db)('nft_mints')
            .where({ owner_address: userId })
            .select('mint_address', 'metadata', 'created_at');
        data.listings = await (0, database_1.db)('marketplace_listings')
            .where({ seller_id: userId })
            .orWhere({ buyer_id: userId })
            .select('id', 'ticket_id', 'price', 'status', 'created_at');
        data.paymentMethods = await (0, database_1.db)('payment_methods')
            .where({ user_id: userId })
            .select('id', 'type', database_1.db.raw('RIGHT(card_last4, 4) as last4'), 'card_brand', 'created_at');
        data.notifications = await (0, database_1.db)('notifications')
            .where({ recipient_id: userId })
            .select('id', 'type', 'channel', 'status', 'created_at');
        data.consent = await (0, database_1.db)('consent')
            .where({ customer_id: userId })
            .select('channel', 'type', 'granted', 'granted_at', 'revoked_at');
        data.activityLogs = await (0, database_1.db)('activity_logs')
            .where({ user_id: userId })
            .where('created_at', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
            .select('action', 'ip_address', 'user_agent', 'created_at')
            .limit(1000);
        return data;
    }
    async createExportArchive(userId, data) {
        const timestamp = Date.now();
        const filename = `user_data_export_${userId}_${timestamp}.zip`;
        const filepath = path.join(this.exportPath, filename);
        if (!fs.existsSync(this.exportPath)) {
            fs.mkdirSync(this.exportPath, { recursive: true });
        }
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(filepath);
            const archive = (0, archiver_1.default)('zip', {
                zlib: { level: 9 }
            });
            output.on('close', () => {
                logger_1.logger.info(`Export created: ${filepath} (${archive.pointer()} bytes)`);
                resolve(filepath);
            });
            archive.on('error', reject);
            archive.pipe(output);
            archive.append(JSON.stringify(data.profile, null, 2), { name: 'profile.json' });
            archive.append(JSON.stringify(data.purchases, null, 2), { name: 'purchases.json' });
            archive.append(JSON.stringify(data.tickets, null, 2), { name: 'tickets.json' });
            archive.append(JSON.stringify(data.nfts, null, 2), { name: 'nfts.json' });
            archive.append(JSON.stringify(data.listings, null, 2), { name: 'marketplace.json' });
            archive.append(JSON.stringify(data.paymentMethods, null, 2), { name: 'payment_methods.json' });
            archive.append(JSON.stringify(data.notifications, null, 2), { name: 'notifications.json' });
            archive.append(JSON.stringify(data.consent, null, 2), { name: 'consent.json' });
            archive.append(JSON.stringify(data.activityLogs, null, 2), { name: 'activity_logs.json' });
            archive.append(this.generateReadme(userId), { name: 'README.txt' });
            archive.finalize();
        });
    }
    generateReadme(userId) {
        return `TicketToken Data Export
========================
User ID: ${userId}
Export Date: ${new Date().toISOString()}

This archive contains all personal data associated with your TicketToken account.

Files included:
- profile.json: Your account information
- purchases.json: Order history
- tickets.json: Tickets you own
- nfts.json: NFT tickets on blockchain
- marketplace.json: Marketplace activity
- payment_methods.json: Payment methods (masked)
- notifications.json: Notification history
- consent.json: Privacy consent records
- activity_logs.json: Recent account activity

This export is provided in compliance with GDPR Article 20 (Right to Data Portability)
and CCPA regulations.

For questions, contact: privacy@tickettoken.com`;
    }
    async requestAccountDeletion(userId, reason) {
        try {
            const requestId = crypto_1.default.randomUUID();
            await (0, database_1.db)('account_deletion_requests').insert({
                id: requestId,
                user_id: userId,
                reason,
                status: 'pending',
                requested_at: new Date(),
                scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
            await this.sendDeletionConfirmation(userId, requestId);
            return {
                requestId,
                message: 'Account deletion scheduled',
                scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                canCancelUntil: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to create deletion request:', error);
            throw error;
        }
    }
    async generateDownloadUrl(filepath) {
        return `/exports/${path.basename(filepath)}`;
    }
    async notifyUserExportReady(userId, downloadUrl) {
        logger_1.logger.info(`Export ready for user ${userId}: ${downloadUrl}`);
    }
    async sendDeletionConfirmation(userId, requestId) {
        logger_1.logger.info(`Deletion requested for user ${userId}: ${requestId}`);
    }
}
exports.PrivacyExportService = PrivacyExportService;
exports.privacyExportService = new PrivacyExportService();
//# sourceMappingURL=privacy-export.service.js.map