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
exports.cacheService = exports.CacheService = void 0;
const models_1 = require("../models");
const logger_1 = require("../utils/logger");
const crypto = __importStar(require("crypto"));
class CacheService {
    static instance;
    log = logger_1.logger.child({ component: 'CacheService' });
    CACHE_SECRET = process.env.CACHE_SECRET || 'default-cache-secret-change-in-production';
    SIGNATURE_ALGORITHM = 'sha256';
    PROTECTED_PREFIXES = ['stats:', 'metrics:', 'aggregate:', 'event:'];
    static getInstance() {
        if (!this.instance) {
            this.instance = new CacheService();
        }
        return this.instance;
    }
    generateSignature(key, value) {
        const data = JSON.stringify({ key, value });
        return crypto
            .createHmac(this.SIGNATURE_ALGORITHM, this.CACHE_SECRET)
            .update(data)
            .digest('hex');
    }
    validateSignature(key, value, signature) {
        const expectedSignature = this.generateSignature(key, value);
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }
    isProtectedKey(key) {
        return this.PROTECTED_PREFIXES.some(prefix => key.startsWith(prefix));
    }
    async get(key) {
        try {
            if (this.isProtectedKey(key)) {
                const signedData = await models_1.CacheModel.get(key);
                if (!signedData)
                    return null;
                if (!this.validateSignature(key, signedData.value, signedData.signature)) {
                    this.log.warn('Cache signature validation failed', { key });
                    await this.delete(key);
                    return null;
                }
                return signedData.value;
            }
            return await models_1.CacheModel.get(key);
        }
        catch (error) {
            this.log.error('Cache get error', { error, key });
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            if (this.isProtectedKey(key)) {
                const hasPermission = this.validateWritePermission(key);
                if (!hasPermission) {
                    throw new Error(`Unauthorized cache write attempt to protected key: ${key}`);
                }
                const signature = this.generateSignature(key, value);
                const signedData = { value, signature };
                await models_1.CacheModel.set(key, signedData, ttl);
            }
            else {
                await models_1.CacheModel.set(key, value, ttl);
            }
        }
        catch (error) {
            this.log.error('Cache set error', { error, key });
            throw error;
        }
    }
    validateWritePermission(key) {
        const serviceId = process.env.SERVICE_ID || 'analytics-service';
        if (key.startsWith('stats:') || key.startsWith('metrics:')) {
            return serviceId === 'analytics-service';
        }
        if (key.startsWith('event:')) {
            return ['event-service', 'analytics-service'].includes(serviceId);
        }
        if (key.startsWith('aggregate:')) {
            return serviceId === 'analytics-service';
        }
        return true;
    }
    async delete(key) {
        try {
            if (this.isProtectedKey(key)) {
                const hasPermission = this.validateWritePermission(key);
                if (!hasPermission) {
                    throw new Error(`Unauthorized cache delete attempt for protected key: ${key}`);
                }
            }
            await models_1.CacheModel.delete(key);
        }
        catch (error) {
            this.log.error('Cache delete error', { error, key });
            throw error;
        }
    }
    async deletePattern(pattern) {
        try {
            const affectsProtected = this.PROTECTED_PREFIXES.some(prefix => pattern.includes(prefix) || pattern === '*');
            if (affectsProtected) {
                const hasPermission = this.validateWritePermission(pattern);
                if (!hasPermission) {
                    throw new Error(`Unauthorized pattern delete for protected keys: ${pattern}`);
                }
            }
            return await models_1.CacheModel.deletePattern(pattern);
        }
        catch (error) {
            this.log.error('Cache delete pattern error', { error, pattern });
            return 0;
        }
    }
    async exists(key) {
        try {
            return await models_1.CacheModel.exists(key);
        }
        catch (error) {
            this.log.error('Cache exists error', { error, key });
            return false;
        }
    }
    async expire(key, ttl) {
        try {
            if (this.isProtectedKey(key)) {
                const hasPermission = this.validateWritePermission(key);
                if (!hasPermission) {
                    throw new Error(`Unauthorized cache expire attempt for protected key: ${key}`);
                }
            }
            await models_1.CacheModel.expire(key, ttl);
        }
        catch (error) {
            this.log.error('Cache expire error', { error, key });
            throw error;
        }
    }
    async increment(key, by = 1) {
        try {
            if (this.isProtectedKey(key)) {
                const hasPermission = this.validateWritePermission(key);
                if (!hasPermission) {
                    throw new Error(`Unauthorized cache increment for protected key: ${key}`);
                }
                const current = await this.get(key) || 0;
                const newValue = current + by;
                await this.set(key, newValue);
                return newValue;
            }
            return await models_1.CacheModel.increment(key, by);
        }
        catch (error) {
            this.log.error('Cache increment error', { error, key });
            return 0;
        }
    }
    async getOrSet(key, factory, ttl) {
        try {
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }
            const value = await factory();
            await this.set(key, value, ttl);
            return value;
        }
        catch (error) {
            this.log.error('Cache getOrSet error', { error, key });
            return await factory();
        }
    }
    async invalidateVenueCache(venueId) {
        try {
            const hasPermission = this.validateWritePermission(`venue:${venueId}`);
            if (!hasPermission) {
                throw new Error(`Unauthorized venue cache invalidation for: ${venueId}`);
            }
            await models_1.CacheModel.invalidateVenueCache(venueId);
            this.log.info('Venue cache invalidated', { venueId });
        }
        catch (error) {
            this.log.error('Failed to invalidate venue cache', { error, venueId });
            throw error;
        }
    }
    async warmupCache(venueId) {
        try {
            this.log.info('Cache warmup started', { venueId });
            this.log.info('Cache warmup completed', { venueId });
        }
        catch (error) {
            this.log.error('Cache warmup failed', { error, venueId });
        }
    }
    async getCacheStats() {
        return {
            hits: 0,
            misses: 0,
            hitRate: 0,
            keys: 0,
            memory: 0
        };
    }
    async flushAll() {
        try {
            const isTest = process.env.NODE_ENV === 'test';
            const isAdmin = process.env.SERVICE_ID === 'admin-service';
            if (!isTest && !isAdmin) {
                throw new Error('Unauthorized cache flush attempt');
            }
            await models_1.CacheModel.deletePattern('*');
            this.log.warn('All cache data flushed');
        }
        catch (error) {
            this.log.error('Failed to flush cache', { error });
            throw error;
        }
    }
}
exports.CacheService = CacheService;
exports.cacheService = CacheService.getInstance();
//# sourceMappingURL=cache.service.js.map