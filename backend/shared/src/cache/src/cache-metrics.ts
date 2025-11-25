export class CacheMetrics {
  private hits = { L1: 0, L2: 0 };
  private misses = 0;
  private errors = 0;
  private latencies: number[] = [];
  private maxLatencies = 1000;

  recordHit(level: 'L1' | 'L2'): void {
    this.hits[level]++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordError(): void {
    this.errors++;
  }

  recordLatency(ms: number): void {
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
      avgLatency:
        this.latencies.length > 0
          ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
          : 0,
      total,
    };
  }

  reset(): void {
    this.hits = { L1: 0, L2: 0 };
    this.misses = 0;
    this.errors = 0;
    this.latencies = [];
  }
}
