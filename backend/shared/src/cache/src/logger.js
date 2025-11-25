"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = void 0;
const createLogger = (name) => {
    const formatMessage = (level, message, args) => {
        const timestamp = new Date().toISOString();
        if (typeof message === 'object') {
            return `[${timestamp}] [${level}] [${name}] ${JSON.stringify(message)} ${args.join(' ')}`;
        }
        return `[${timestamp}] [${level}] [${name}] ${message} ${args.join(' ')}`;
    };
    return {
        info: (message, ...args) => console.log(formatMessage('INFO', message, args)),
        error: (message, ...args) => console.error(formatMessage('ERROR', message, args)),
        debug: (message, ...args) => {
            if (process.env.DEBUG)
                console.log(formatMessage('DEBUG', message, args));
        },
        warn: (message, ...args) => console.warn(formatMessage('WARN', message, args))
    };
};
exports.createLogger = createLogger;
//# sourceMappingURL=logger.js.map