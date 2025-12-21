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
Object.defineProperty(exports, "__esModule", { value: true });
exports.anonymizationService = exports.AnonymizationService = void 0;
const crypto = __importStar(require("crypto"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class AnonymizationService {
    static instance;
    log = logger_1.logger.child({ component: 'AnonymizationService' });
    dailySalt;
    saltGeneratedAt;
    static getInstance() {
        if (!this.instance) {
            this.instance = new AnonymizationService();
        }
        return this.instance;
    }
    constructor() {
        this.dailySalt = this.generateDailySalt();
        this.saltGeneratedAt = new Date();
    }
    generateDailySalt() {
        const date = new Date().toISOString().split('T')[0];
        return crypto
            .createHash('sha256')
            .update(`${config_1.config.privacy.customerHashSalt}-${date}`)
            .digest('hex');
    }
    checkAndUpdateSalt() {
        const now = new Date();
        const lastGenerated = new Date(this.saltGeneratedAt);
        if (now.getDate() !== lastGenerated.getDate()) {
            this.dailySalt = this.generateDailySalt();
            this.saltGeneratedAt = now;
            this.log.info('Daily salt rotated');
        }
    }
    async hashCustomerId(customerId) {
        this.checkAndUpdateSalt();
        return crypto
            .createHash('sha256')
            .update(`${customerId}-${this.dailySalt}`)
            .digest('hex')
            .substring(0, 16);
    }
    async hashEmail(email) {
        this.checkAndUpdateSalt();
        const normalizedEmail = email.toLowerCase().trim();
        return crypto
            .createHash('sha256')
            .update(`${normalizedEmail}-${this.dailySalt}`)
            .digest('hex');
    }
    anonymizeLocation(location) {
        if (!location)
            return null;
        return {
            country: location.country,
            region: location.region || location.state,
            postalCode: location.postalCode?.substring(0, 3)
        };
    }
    anonymizeDeviceInfo(deviceInfo) {
        if (!deviceInfo)
            return null;
        return {
            type: deviceInfo.type || 'unknown',
            os: this.generalizeOS(deviceInfo.os),
            browser: this.generalizeBrowser(deviceInfo.browser)
        };
    }
    generalizeOS(os) {
        if (!os)
            return 'unknown';
        const osLower = os.toLowerCase();
        if (osLower.includes('windows'))
            return 'Windows';
        if (osLower.includes('mac') || osLower.includes('darwin'))
            return 'macOS';
        if (osLower.includes('linux'))
            return 'Linux';
        if (osLower.includes('android'))
            return 'Android';
        if (osLower.includes('ios') || osLower.includes('iphone'))
            return 'iOS';
        return 'Other';
    }
    generalizeBrowser(browser) {
        if (!browser)
            return 'unknown';
        const browserLower = browser.toLowerCase();
        if (browserLower.includes('chrome'))
            return 'Chrome';
        if (browserLower.includes('firefox'))
            return 'Firefox';
        if (browserLower.includes('safari'))
            return 'Safari';
        if (browserLower.includes('edge'))
            return 'Edge';
        if (browserLower.includes('opera'))
            return 'Opera';
        return 'Other';
    }
    aggregateAgeGroup(age) {
        if (!age)
            return undefined;
        if (age < 18)
            return 'under-18';
        if (age < 25)
            return '18-24';
        if (age < 35)
            return '25-34';
        if (age < 45)
            return '35-44';
        if (age < 55)
            return '45-54';
        if (age < 65)
            return '55-64';
        return '65+';
    }
    anonymizeCustomerData(data) {
        const anonymized = { ...data };
        delete anonymized.firstName;
        delete anonymized.lastName;
        delete anonymized.email;
        delete anonymized.phone;
        delete anonymized.address;
        delete anonymized.dateOfBirth;
        delete anonymized.socialSecurityNumber;
        delete anonymized.creditCard;
        if (anonymized.location) {
            anonymized.location = this.anonymizeLocation(anonymized.location);
        }
        if (anonymized.deviceInfo) {
            anonymized.deviceInfo = this.anonymizeDeviceInfo(anonymized.deviceInfo);
        }
        if (anonymized.age) {
            anonymized.ageGroup = this.aggregateAgeGroup(anonymized.age);
            delete anonymized.age;
        }
        return anonymized;
    }
    generateAnonymousId() {
        return crypto.randomBytes(16).toString('hex');
    }
}
exports.AnonymizationService = AnonymizationService;
exports.anonymizationService = AnonymizationService.getInstance();
//# sourceMappingURL=anonymization.service.js.map