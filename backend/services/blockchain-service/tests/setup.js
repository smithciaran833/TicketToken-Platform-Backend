"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: '.env.test' });
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
const noop = () => { };
global.console = {
    ...console,
    log: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: console.error,
};
//# sourceMappingURL=setup.js.map