"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportStatus = exports.ExportFormat = exports.ExportType = void 0;
var ExportType;
(function (ExportType) {
    ExportType["ANALYTICS_REPORT"] = "analytics_report";
    ExportType["CUSTOMER_LIST"] = "customer_list";
    ExportType["TRANSACTION_HISTORY"] = "transaction_history";
    ExportType["EVENT_SUMMARY"] = "event_summary";
    ExportType["FINANCIAL_REPORT"] = "financial_report";
    ExportType["DASHBOARD_SNAPSHOT"] = "dashboard_snapshot";
    ExportType["RAW_DATA"] = "raw_data";
    ExportType["CUSTOM_REPORT"] = "custom_report";
})(ExportType || (exports.ExportType = ExportType = {}));
var ExportFormat;
(function (ExportFormat) {
    ExportFormat["CSV"] = "csv";
    ExportFormat["XLSX"] = "xlsx";
    ExportFormat["PDF"] = "pdf";
    ExportFormat["JSON"] = "json";
    ExportFormat["XML"] = "xml";
})(ExportFormat || (exports.ExportFormat = ExportFormat = {}));
var ExportStatus;
(function (ExportStatus) {
    ExportStatus["PENDING"] = "pending";
    ExportStatus["PROCESSING"] = "processing";
    ExportStatus["COMPLETED"] = "completed";
    ExportStatus["FAILED"] = "failed";
    ExportStatus["CANCELLED"] = "cancelled";
    ExportStatus["EXPIRED"] = "expired";
})(ExportStatus || (exports.ExportStatus = ExportStatus = {}));
//# sourceMappingURL=export.types.js.map