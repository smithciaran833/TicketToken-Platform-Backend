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
exports.exportService = exports.ExportService = void 0;
const models_1 = require("../models");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const message_gateway_service_1 = require("./message-gateway.service");
const fs = __importStar(require("fs/promises"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
const json2csv_1 = require("json2csv");
const pdfkit_1 = __importDefault(require("pdfkit"));
class ExportService {
    static instance;
    log = logger_1.logger.child({ component: 'ExportService' });
    static getInstance() {
        if (!this.instance) {
            this.instance = new ExportService();
        }
        return this.instance;
    }
    mapDBExportToExportRequest(dbExport) {
        const dateRange = dbExport.parameters?.dateRange || {
            start: new Date(),
            end: new Date()
        };
        return {
            id: dbExport.id,
            venueId: dbExport.tenant_id,
            userId: dbExport.requested_by,
            type: dbExport.export_type || types_1.ExportType.ANALYTICS_REPORT,
            format: dbExport.format || types_1.ExportFormat.CSV,
            status: dbExport.status || types_1.ExportStatus.PENDING,
            filters: {
                dateRange: {
                    start: new Date(dateRange.start),
                    end: new Date(dateRange.end)
                },
                ...(dbExport.parameters || {})
            },
            options: dbExport.parameters?.options || {},
            fileUrl: dbExport.file_url,
            fileSize: dbExport.file_size,
            error: dbExport.error_message,
            createdAt: dbExport.created_at,
            completedAt: dbExport.updated_at
        };
    }
    async createExport(request) {
        try {
            const dbExport = await models_1.ExportModel.createExport({
                ...request,
                status: types_1.ExportStatus.PENDING
            });
            const exportRequest = this.mapDBExportToExportRequest(dbExport);
            this.processExportAsync(dbExport.id);
            return exportRequest;
        }
        catch (error) {
            this.log.error('Failed to create export', error);
            throw error;
        }
    }
    async processExportAsync(exportId) {
        try {
            await models_1.ExportModel.updateExportStatus(exportId, types_1.ExportStatus.PROCESSING);
            const dbExport = await models_1.ExportModel.findById(exportId);
            if (!dbExport) {
                throw new Error('Export request not found');
            }
            const exportRequest = this.mapDBExportToExportRequest(dbExport);
            let filePath;
            switch (exportRequest.type) {
                case types_1.ExportType.ANALYTICS_REPORT:
                    filePath = await this.generateAnalyticsReport(exportRequest);
                    break;
                case types_1.ExportType.CUSTOMER_LIST:
                    filePath = await this.generateCustomerList(exportRequest);
                    break;
                case types_1.ExportType.FINANCIAL_REPORT:
                    filePath = await this.generateFinancialReport(exportRequest);
                    break;
                default:
                    throw new Error(`Unsupported export type: ${exportRequest.type}`);
            }
            const fileUrl = await this.uploadToStorage(filePath);
            const fileSize = (await fs.stat(filePath)).size;
            await models_1.ExportModel.updateExportStatus(exportId, types_1.ExportStatus.COMPLETED, {
                fileUrl,
                fileSize,
                completedAt: new Date()
            });
            await message_gateway_service_1.messageGatewayService.sendMessage('email', exportRequest.userId, 'report-ready-email', {
                reportName: exportRequest.type,
                generatedAt: new Date().toISOString(),
                fileSize: this.formatFileSize(fileSize),
                downloadUrl: fileUrl,
                expirationDays: 7
            });
            await fs.unlink(filePath);
        }
        catch (error) {
            this.log.error('Failed to process export', error, { exportId });
            await models_1.ExportModel.updateExportStatus(exportId, types_1.ExportStatus.FAILED, {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    async generateAnalyticsReport(exportRequest) {
        const data = await this.fetchAnalyticsData(exportRequest);
        switch (exportRequest.format) {
            case types_1.ExportFormat.CSV:
                return await this.generateCSV(data, 'analytics-report');
            case types_1.ExportFormat.XLSX:
                return await this.generateExcel(data, 'analytics-report');
            case types_1.ExportFormat.PDF:
                return await this.generatePDF(data, 'analytics-report');
            default:
                throw new Error(`Unsupported format: ${exportRequest.format}`);
        }
    }
    async generateCustomerList(exportRequest) {
        const data = await this.fetchCustomerData(exportRequest);
        switch (exportRequest.format) {
            case types_1.ExportFormat.CSV:
                return await this.generateCSV(data.customers, 'customer-list');
            case types_1.ExportFormat.XLSX:
                return await this.generateExcel(data, 'customer-list');
            default:
                throw new Error(`Unsupported format: ${exportRequest.format}`);
        }
    }
    async generateFinancialReport(exportRequest) {
        const data = await this.fetchFinancialData(exportRequest);
        switch (exportRequest.format) {
            case types_1.ExportFormat.PDF:
                return await this.generatePDF(data, 'financial-report');
            case types_1.ExportFormat.XLSX:
                return await this.generateExcel(data, 'financial-report');
            default:
                throw new Error(`Unsupported format: ${exportRequest.format}`);
        }
    }
    async generateCSV(data, fileName) {
        const filePath = path.join('/tmp', `${fileName}-${Date.now()}.csv`);
        const parser = new json2csv_1.Parser();
        const csv = parser.parse(data);
        await fs.writeFile(filePath, csv);
        return filePath;
    }
    async generateExcel(data, fileName) {
        const filePath = path.join('/tmp', `${fileName}-${Date.now()}.xlsx`);
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('Report');
        if (Array.isArray(data)) {
            if (data.length > 0) {
                worksheet.columns = Object.keys(data[0]).map(key => ({
                    header: key,
                    key: key,
                    width: 15
                }));
                worksheet.addRows(data);
            }
        }
        else if (data.summary && data.customers) {
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.addRow(['Metric', 'Value']);
            Object.entries(data.summary).forEach(([key, value]) => {
                summarySheet.addRow([key, value]);
            });
            worksheet.columns = Object.keys(data.customers[0] || {}).map(key => ({
                header: key,
                key: key,
                width: 15
            }));
            worksheet.addRows(data.customers);
        }
        await workbook.xlsx.writeFile(filePath);
        return filePath;
    }
    async generatePDF(data, fileName) {
        const filePath = path.join('/tmp', `${fileName}-${Date.now()}.pdf`);
        const doc = new pdfkit_1.default();
        const stream = (0, fs_1.createWriteStream)(filePath);
        doc.pipe(stream);
        doc.fontSize(20).text('Analytics Report', { align: 'center' });
        doc.moveDown();
        if (data.summary) {
            doc.fontSize(16).text('Summary', { underline: true });
            doc.moveDown();
            Object.entries(data.summary).forEach(([key, value]) => {
                doc.fontSize(12).text(`${key}: ${value}`);
            });
        }
        doc.end();
        return new Promise((resolve) => {
            stream.on('finish', () => resolve(filePath));
        });
    }
    async fetchAnalyticsData(_exportRequest) {
        return [
            { date: '2024-01-01', sales: 100, revenue: 10000 },
            { date: '2024-01-02', sales: 120, revenue: 12000 },
            { date: '2024-01-03', sales: 90, revenue: 9000 }
        ];
    }
    async fetchCustomerData(_exportRequest) {
        return {
            summary: {
                totalCustomers: 1000,
                newCustomers: 150,
                activeCustomers: 800
            },
            customers: [
                {
                    customerId: 'hash-1',
                    firstPurchase: new Date('2023-01-01'),
                    lastPurchase: new Date('2024-01-01'),
                    totalSpent: 500,
                    totalTickets: 5,
                    segment: 'regular'
                }
            ]
        };
    }
    async fetchFinancialData(_exportRequest) {
        return {
            summary: {
                totalRevenue: 100000,
                totalTransactions: 1000,
                averageOrderValue: 100,
                refundAmount: 5000,
                netRevenue: 95000
            },
            byPeriod: [],
            byEventType: [],
            transactions: []
        };
    }
    async uploadToStorage(filePath) {
        return `https://storage.example.com/exports/${path.basename(filePath)}`;
    }
    formatFileSize(bytes) {
        if (bytes < 1024)
            return bytes + ' B';
        if (bytes < 1024 * 1024)
            return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024)
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
    async getExportStatus(exportId) {
        const dbExport = await models_1.ExportModel.findById(exportId);
        return dbExport ? this.mapDBExportToExportRequest(dbExport) : null;
    }
    async getUserExports(userId, venueId, limit = 50) {
        const exports = await models_1.ExportModel.getExportsByUser(userId, venueId, limit);
        return exports.map(exp => this.mapDBExportToExportRequest(exp));
    }
}
exports.ExportService = ExportService;
exports.exportService = ExportService.getInstance();
//# sourceMappingURL=export.service.js.map