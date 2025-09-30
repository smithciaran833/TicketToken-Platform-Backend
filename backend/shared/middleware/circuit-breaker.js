// WP-12 Phase 2: Circuit Breaker Implementation
const CircuitBreakerStates = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitoringWindow = options.monitoringWindow || 60000; // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 3;
    
    this.state = CircuitBreakerStates.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.halfOpenAttempts = 0;
    this.recentFailures = [];
  }

  async execute(fn) {
    if (this.state === CircuitBreakerStates.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      this.state = CircuitBreakerStates.HALF_OPEN;
      this.halfOpenAttempts = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    
    if (this.state === CircuitBreakerStates.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenRequests) {
        this.state = CircuitBreakerStates.CLOSED;
        console.log(`Circuit breaker ${this.name} is now CLOSED`);
      }
    }
  }

  onFailure() {
    this.failures++;
    this.recentFailures.push(Date.now());
    
    // Remove old failures outside monitoring window
    const cutoff = Date.now() - this.monitoringWindow;
    this.recentFailures = this.recentFailures.filter(time => time > cutoff);
    
    if (this.recentFailures.length >= this.failureThreshold) {
      this.state = CircuitBreakerStates.OPEN;
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.log(`Circuit breaker ${this.name} is now OPEN`);
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      nextAttempt: this.nextAttempt
    };
  }
}

module.exports = CircuitBreaker;
