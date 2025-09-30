require('dotenv').config();

// Security imports
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import the communication layer
const ServiceBootstrap = require(path.join(__dirname, '../../../shared/src/service-bootstrap'));

const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-indexer';
const PORT = process.env.PORT || 3012;

async function startService() {
  try {
    console.log(`Starting ${SERVICE_NAME}...`);
    
    // Initialize service communication
    const bootstrap = new ServiceBootstrap(SERVICE_NAME, PORT);
    const { eventBus, client } = await bootstrap.initialize();
    
    // Create Express app
    const app = express()
// Apply security middleware
app.use(helmet());
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests'
}));
;
    
    // Middleware
    app.use(cors());
    app.use(express.json());
    
    // Add health endpoint
    bootstrap.addHealthEndpoint(app);
    
    // Service info endpoint
    app.get('/info', (req, res) => {
      res.json({
        service: SERVICE_NAME,
        version: '1.0.0',
        port: PORT,
        status: 'healthy',
        communication: 'enabled'
      });
    });
    
    // Make event bus and client available
    app.locals.eventBus = eventBus;
    app.locals.serviceClient = client;
    
    // Basic service endpoint
    app.get('/api/v1/status', (req, res) => {
      res.json({ 
        status: 'running',
        service: SERVICE_NAME,
        port: PORT 
      });
    });
    
    // Test communication endpoint
    app.get('/api/v1/test-communication', async (req, res) => {
      try {
        const services = await bootstrap.registry.getAllServices();
        res.json({
          success: true,
          service: SERVICE_NAME,
          discoveredServices: services.length,
          services: services.map(s => ({ name: s.name, port: s.port, status: s.status }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Service-specific event subscriptions
    switch(SERVICE_NAME) {
      case 'payment-service':
        await eventBus.subscribe('order.*', async (event) => {
          console.log('Payment service received:', event.type);
        });
        break;
      case 'notification-service':
        await eventBus.subscribe('*', async (event) => {
          console.log('Notification service received:', event.type);
        });
        break;
      case 'ticket-service':
        await eventBus.subscribe('payment.*', async (event) => {
          console.log('Ticket service received:', event.type);
        });
        break;
      case 'blockchain-service':
        await eventBus.subscribe('ticket.*', async (event) => {
          console.log('Blockchain service received:', event.type);
        });
        break;
      case 'order-service':
        await eventBus.subscribe('payment.*', async (event) => {
          console.log('Order service received:', event.type);
        });
        break;
    }
    
    // Start server
    const server = app.listen(PORT, () => {
      console.log(`✅ ${SERVICE_NAME} running on port ${PORT}`);
      console.log(`   - Health: http://0.0.0.0:${PORT}/health`);
      console.log(`   - Info: http://0.0.0.0:${PORT}/info`);
    });
    
    // Graceful shutdown
    bootstrap.onShutdown(async () => {
      console.log(`Shutting down ${SERVICE_NAME}...`);
      server.close();
    });
    
  } catch (error) {
    console.error(`Failed to start ${SERVICE_NAME}:`, error);
    process.exit(1);
  }
}

// Start the service
startService().catch(console.error);
