"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONSTANTS = void 0;
exports.CONSTANTS = {
    CACHE_TTL: {
        REAL_TIME: 5,
        METRICS: 60,
        INSIGHTS: 300,
        CUSTOMER_PROFILE: 3600,
        DASHBOARD: 120,
    },
    METRIC_TYPES: {
        SALES: 'sales',
        REVENUE: 'revenue',
        ATTENDANCE: 'attendance',
        CAPACITY: 'capacity',
        CONVERSION: 'conversion',
        CART_ABANDONMENT: 'cart_abandonment',
    },
    WIDGET_CATEGORIES: {
        REAL_TIME: 'real-time',
        INSIGHTS: 'insights',
        PREDICTIONS: 'predictions',
        CUSTOM: 'custom',
    },
    CUSTOMER_SEGMENTS: {
        NEW: 'new',
        RETURNING: 'returning',
        VIP: 'vip',
        AT_RISK: 'at_risk',
        LOST: 'lost',
    },
    ALERT_PRIORITIES: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical',
    },
    EXPORT_FORMATS: {
        CSV: 'csv',
        XLSX: 'xlsx',
        PDF: 'pdf',
        JSON: 'json',
    },
    RETENTION_PERIODS: {
        RAW_EVENTS: 30,
        AGGREGATED_METRICS: 365,
        CUSTOMER_PROFILES: 730,
        AUDIT_LOGS: 2555,
    },
    RATE_LIMITS: {
        REAL_TIME: 100,
        EXPORTS: 10,
        MESSAGES: 50,
    },
    BATCH_SIZES: {
        EVENT_PROCESSING: 100,
        AGGREGATION: 1000,
        EXPORT: 10000,
    },
    QUEUE_PRIORITIES: {
        HIGH: 1,
        MEDIUM: 5,
        LOW: 10,
    },
};
//# sourceMappingURL=constants.js.map