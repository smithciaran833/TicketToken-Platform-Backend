"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CIRCUIT_BREAKER_CONFIGS = exports.circuitBreakerManager = exports.CircuitBreakerManager = exports.CircuitBreaker = exports.CircuitBreakerError = exports.CircuitState = void 0;
const logger_1 = require("./logger");
const metrics_1 = require("./metrics");
var CircuitState;
(function (CircuitState) {
    CircuitState[CircuitState["CLOSED"] = 0] = "CLOSED";
    CircuitState[CircuitState["OPEN"] = 1] = "OPEN";
    CircuitState[CircuitState["HALF_OPEN"] = 2] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreakerError extends Error {
    state;
    constructor(message, state) {
        super(message);
        this.state = state;
        this.name = 'CircuitBreakerError';
    }
}
exports.CircuitBreakerError = CircuitBreakerError;
class CircuitBreaker {
    name;
    options;
    state = CircuitState.CLOSED;
    failureCount = 0;
    successCount = 0;
    lastFailureTime = null;
    nextAttemptTime = 0;
    constructor(name, options = {}) {
        this.name = name;
        this.options = options;
        const { failureThreshold = 5, successThreshold = 2, timeout = 60000, resetTimeout = 30000, monitoringPeriod = 10000 } = options;
        this.options = {
            failureThreshold,
            successThreshold,
            timeout,
            resetTimeout,
            monitoringPeriod
        };
        this.updateMetrics();
        this.startMonitoring();
    }
    async execute(operation) {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() >= this.nextAttemptTime) {
                logger_1.logger.info(`Circuit breaker ${this.name}: transitioning to HALF_OPEN`);
                this.state = CircuitState.HALF_OPEN;
                this.updateMetrics();
            }
            else {
                throw new CircuitBreakerError(`Circuit breaker ${this.name} is OPEN`, CircuitState.OPEN);
            }
        }
        try {
            const result = await this.executeWithTimeout(operation);
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    async executeWithTimeout(operation) {
        const { timeout } = this.options;
        return Promise.race([
            operation(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Circuit breaker timeout after ${timeout}ms`)), timeout))
        ]);
    }
    onSuccess() {
        this.failureCount = 0;
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.options.successThreshold) {
                logger_1.logger.info(`Circuit breaker ${this.name}: transitioning to CLOSED`);
                this.state = CircuitState.CLOSED;
                this.successCount = 0;
                this.updateMetrics();
            }
        }
    }
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.state === CircuitState.HALF_OPEN) {
            logger_1.logger.warn(`Circuit breaker ${this.name}: transitioning back to OPEN`);
            this.openCircuit();
        }
        else if (this.failureCount >= this.options.failureThreshold) {
            logger_1.logger.error(`Circuit breaker ${this.name}: transitioning to OPEN`);
            this.openCircuit();
            metrics_1.circuitBreakerTrips.inc({ operation: this.name });
        }
    }
    openCircuit() {
        this.state = CircuitState.OPEN;
        this.successCount = 0;
        this.nextAttemptTime = Date.now() + this.options.resetTimeout;
        this.updateMetrics();
    }
    getState() {
        return this.state;
    }
    getStats() {
        return {
            state: CircuitState[this.state],
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : null
        };
    }
    reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.nextAttemptTime = 0;
        this.updateMetrics();
        logger_1.logger.info(`Circuit breaker ${this.name}: manually reset`);
    }
    updateMetrics() {
        metrics_1.circuitBreakerState.set({ operation: this.name }, this.state);
    }
    startMonitoring() {
        setInterval(() => {
            if (this.state === CircuitState.OPEN &&
                this.lastFailureTime &&
                Date.now() - this.lastFailureTime > this.options.monitoringPeriod) {
                if (Date.now() >= this.nextAttemptTime) {
                    logger_1.logger.info(`Circuit breaker ${this.name}: auto-transitioning to HALF_OPEN`);
                    this.state = CircuitState.HALF_OPEN;
                    this.successCount = 0;
                    this.updateMetrics();
                }
            }
        }, this.options.monitoringPeriod);
    }
}
exports.CircuitBreaker = CircuitBreaker;
class CircuitBreakerManager {
    breakers = new Map();
    getBreaker(name, options) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker(name, options));
        }
        return this.breakers.get(name);
    }
    async execute(name, operation, options) {
        const breaker = this.getBreaker(name, options);
        return breaker.execute(operation);
    }
    getAllStats() {
        const stats = {};
        for (const [name, breaker] of this.breakers.entries()) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }
    reset(name) {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
}
exports.CircuitBreakerManager = CircuitBreakerManager;
exports.circuitBreakerManager = new CircuitBreakerManager();
exports.CIRCUIT_BREAKER_CONFIGS = {
    rpcCall: {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
        monitoringPeriod: 10000
    },
    transactionSubmission: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 60000,
        resetTimeout: 120000,
        monitoringPeriod: 15000
    },
    mintOperation: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 120000,
        resetTimeout: 180000,
        monitoringPeriod: 30000
    },
    externalService: {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 10000,
        resetTimeout: 30000,
        monitoringPeriod: 5000
    }
};
exports.default = {
    CircuitBreaker,
    CircuitBreakerManager,
    circuitBreakerManager: exports.circuitBreakerManager,
    CircuitState,
    CIRCUIT_BREAKER_CONFIGS: exports.CIRCUIT_BREAKER_CONFIGS
};
//# sourceMappingURL=circuitBreaker.js.map