// Example: How to use circuit breakers in services

const CircuitBreaker = require('./circuit-breaker');
const RetryHandler = require('./retry-logic');
const config = require('../config/resilience-config');

// Initialize circuit breakers for different services
const breakers = {
  stripe: new CircuitBreaker({ name: 'stripe', ...config.circuitBreakers.stripe }),
  database: new CircuitBreaker({ name: 'database', ...config.circuitBreakers.database }),
  blockchain: new CircuitBreaker({ name: 'blockchain', ...config.circuitBreakers.blockchain })
};

// Initialize retry handlers
const retryHandlers = {
  payment: new RetryHandler(config.retry.payment),
  blockchain: new RetryHandler(config.retry.blockchain)
};

// Example: Payment with circuit breaker and retry
async function processPayment(paymentData) {
  return await retryHandlers.payment.execute(async () => {
    return await breakers.stripe.execute(async () => {
      // Actual Stripe API call here
      const result = await stripe.charges.create(paymentData);
      return result;
    });
  });
}

// Example: Blockchain operation with circuit breaker
async function mintNFT(mintData) {
  return await retryHandlers.blockchain.execute(async () => {
    return await breakers.blockchain.execute(async () => {
      // Actual blockchain call here
      const result = await solanaConnection.sendTransaction(mintData);
      return result;
    });
  });
}

// Export for use in services
module.exports = {
  breakers,
  retryHandlers,
  processPayment,
  mintNFT
};
