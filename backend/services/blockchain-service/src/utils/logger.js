"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoggerWithContext = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const isProduction = process.env.NODE_ENV === 'production';
const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';
const devFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}] ${message} ${metaStr}`;
}));
const prodFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    format: isProduction ? prodFormat : devFormat,
    defaultMeta: {
        service: SERVICE_NAME,
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        new winston_1.default.transports.Console({
            stderrLevels: ['error', 'warn']
        })
    ],
    exitOnError: false
});
const createLoggerWithContext = (requestId) => {
    return exports.logger.child({ requestId });
};
exports.createLoggerWithContext = createLoggerWithContext;
//# sourceMappingURL=logger.js.map