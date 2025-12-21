"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationService = exports.ValidationService = void 0;
const errors_1 = require("../utils/errors");
class ValidationService {
    static instance;
    static getInstance() {
        if (!this.instance) {
            this.instance = new ValidationService();
        }
        return this.instance;
    }
    validateDateRange(startDate, endDate) {
        if (startDate > endDate) {
            throw new errors_1.ValidationError('Start date must be before end date');
        }
        const maxRange = 365 * 24 * 60 * 60 * 1000;
        if (endDate.getTime() - startDate.getTime() > maxRange) {
            throw new errors_1.ValidationError('Date range cannot exceed 1 year');
        }
    }
    validatePaginationParams(page, limit) {
        if (page < 1) {
            throw new errors_1.ValidationError('Page must be greater than 0');
        }
        if (limit < 1 || limit > 1000) {
            throw new errors_1.ValidationError('Limit must be between 1 and 1000');
        }
    }
    validateMetricType(metricType) {
        const validTypes = [
            'sales', 'revenue', 'attendance', 'capacity',
            'conversion', 'cart_abandonment', 'average_order_value',
            'customer_lifetime_value'
        ];
        if (!validTypes.includes(metricType)) {
            throw new errors_1.ValidationError(`Invalid metric type: ${metricType}`);
        }
    }
    validateExportFormat(format) {
        const validFormats = ['csv', 'xlsx', 'pdf', 'json', 'xml'];
        if (!validFormats.includes(format.toLowerCase())) {
            throw new errors_1.ValidationError(`Invalid export format: ${format}`);
        }
    }
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new errors_1.ValidationError('Invalid email address');
        }
    }
    validatePhoneNumber(phone) {
        const phoneRegex = /^\+?[\d\s-()]+$/;
        if (!phoneRegex.test(phone) || phone.length < 10) {
            throw new errors_1.ValidationError('Invalid phone number');
        }
    }
    validateUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuid)) {
            throw new errors_1.ValidationError('Invalid UUID format');
        }
    }
    validateTimeGranularity(unit, value) {
        const validUnits = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
        if (!validUnits.includes(unit)) {
            throw new errors_1.ValidationError(`Invalid time unit: ${unit}`);
        }
        if (value < 1 || value > 100) {
            throw new errors_1.ValidationError('Time value must be between 1 and 100');
        }
    }
    validateAlertThreshold(value, min, max) {
        if (min !== undefined && value < min) {
            throw new errors_1.ValidationError(`Threshold must be at least ${min}`);
        }
        if (max !== undefined && value > max) {
            throw new errors_1.ValidationError(`Threshold must be at most ${max}`);
        }
    }
    validateWidgetConfig(config) {
        if (!config.type) {
            throw new errors_1.ValidationError('Widget type is required');
        }
        if (!config.title || config.title.length < 1) {
            throw new errors_1.ValidationError('Widget title is required');
        }
        if (!config.metrics || !Array.isArray(config.metrics) || config.metrics.length === 0) {
            throw new errors_1.ValidationError('At least one metric is required');
        }
        if (!config.size || !config.size.width || !config.size.height) {
            throw new errors_1.ValidationError('Widget size is required');
        }
        if (config.size.width < 1 || config.size.width > 12) {
            throw new errors_1.ValidationError('Widget width must be between 1 and 12');
        }
        if (config.size.height < 1 || config.size.height > 12) {
            throw new errors_1.ValidationError('Widget height must be between 1 and 12');
        }
    }
    validateDashboardName(name) {
        if (!name || name.trim().length < 1) {
            throw new errors_1.ValidationError('Dashboard name is required');
        }
        if (name.length > 100) {
            throw new errors_1.ValidationError('Dashboard name must be less than 100 characters');
        }
        const validNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
        if (!validNameRegex.test(name)) {
            throw new errors_1.ValidationError('Dashboard name contains invalid characters');
        }
    }
    validateCampaignDates(startDate, endDate) {
        const now = new Date();
        if (startDate < now) {
            throw new errors_1.ValidationError('Campaign start date cannot be in the past');
        }
        this.validateDateRange(startDate, endDate);
    }
    validateBudget(budget) {
        if (budget < 0) {
            throw new errors_1.ValidationError('Budget cannot be negative');
        }
        if (budget > 1000000000) {
            throw new errors_1.ValidationError('Budget exceeds maximum allowed value');
        }
    }
    sanitizeInput(input) {
        return input
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    }
    validateSearchQuery(query) {
        if (!query || query.trim().length < 1) {
            throw new errors_1.ValidationError('Search query cannot be empty');
        }
        if (query.length > 200) {
            throw new errors_1.ValidationError('Search query is too long');
        }
        const sqlPatterns = /(\b(union|select|insert|update|delete|drop|create)\b)|(-{2})|\/\*|\*\//i;
        if (sqlPatterns.test(query)) {
            throw new errors_1.ValidationError('Invalid search query');
        }
    }
}
exports.ValidationService = ValidationService;
exports.validationService = ValidationService.getInstance();
//# sourceMappingURL=validation.service.js.map