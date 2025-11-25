"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheMetrics = void 0;
class CacheMetrics {
    hits = { L1: 0, L2: 0 };
    misses = 0;
    errors = 0;
    latencies = [];
    maxLatencies = 1000;
    recordHit(level) {
        this.hits[level]++;
    }
    recordMiss() {
        this.misses++;
    }
    recordError() {
        this.errors++;
    }
    recordLatency(ms) {
        this.latencies.push(ms);
        if (this.latencies.length > this.maxLatencies) {
            this.latencies.shift();
        }
    }
    getStats() {
        const totalHits = this.hits.L1 + this.hits.L2;
        const total = totalHits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            errors: this.errors,
            hitRate: total > 0 ? (totalHits / total) * 100 : 0,
            avgLatency: this.latencies.length > 0
                ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
                : 0,
            total
        };
    }
    reset() {
        this.hits = { L1: 0, L2: 0 };
        this.misses = 0;
        this.errors = 0;
        this.latencies = [];
    }
}
exports.CacheMetrics = CacheMetrics;
//# sourceMappingURL=cache-metrics.js.map