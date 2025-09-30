const ServiceRegistry = require('../service-registry');
const EventBus = require('../event-bus');
const ServiceClient = require('../service-client');

class ServiceBootstrap {
  constructor(serviceName, port) {
    this.serviceName = serviceName;
    this.port = port;
    this.registry = new ServiceRegistry();
    this.eventBus = new EventBus();
    this.client = new ServiceClient(this.registry);
    this.shutdownHandlers = [];
  }

  async initialize() {
    console.log(`🚀 Initializing ${this.serviceName}...`);
    
    await this.eventBus.connect();
    
    await this.registry.register(this.serviceName, this.port, {
      environment: process.env.NODE_ENV || 'development',
      startTime: new Date().toISOString()
    });
    
    this.setupGracefulShutdown();
    
    return {
      registry: this.registry,
      eventBus: this.eventBus,
      client: this.client
    };
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down ${this.serviceName}...`);
      
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          console.error('Shutdown handler error:', error);
        }
      }
      
      await this.registry.deregister(this.serviceName);
      await this.eventBus.cleanup();
      await this.registry.cleanup();
      
      console.log(`${this.serviceName} shutdown complete`);
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  onShutdown(handler) {
    this.shutdownHandlers.push(handler);
  }

  addHealthEndpoint(app) {
    app.get('/health', async (req, res) => {
      const health = {
        service: this.serviceName,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        circuitBreakers: this.client.getAllBreakers()
      };
      
      res.json(health);
    });
  }
}

module.exports = ServiceBootstrap;
