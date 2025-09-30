class ChaosMonkey {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.probability = options.probability || 0.1;
    this.scenarios = options.scenarios || ['latency', 'error', 'timeout'];
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled || Math.random() > this.probability) {
        return next();
      }

      const scenario = this.scenarios[Math.floor(Math.random() * this.scenarios.length)];
      
      switch(scenario) {
        case 'latency':
          setTimeout(next, Math.random() * 5000);
          break;
        case 'error':
          res.status(500).json({ error: 'Chaos monkey error' });
          break;
        case 'timeout':
          setTimeout(() => res.status(504).json({ error: 'Gateway timeout' }), 30000);
          break;
        default:
          next();
      }
    };
  }

  // Test alert firing
  async triggerAlerts() {
    const alerts = [];
    
    // Trigger high error rate
    for (let i = 0; i < 100; i++) {
      alerts.push({ type: 'error', status: 500 });
    }
    
    // Trigger slow response
    alerts.push({ type: 'slow_response', duration: 5000 });
    
    // Trigger service down
    alerts.push({ type: 'service_down', service: 'test-service' });
    
    return alerts;
  }
}

module.exports = ChaosMonkey;
