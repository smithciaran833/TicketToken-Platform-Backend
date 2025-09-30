#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../backend/services');
const portMap = new Map();
const errors = [];

// Expected ports from serviceMap
const expectedPorts = {
  'auth-service': 3001,
  'venue-service': 3002,
  'event-service': 3003,
  'ticket-service': 3004,
  'order-service': 3005,
  'payment-service': 3006,
  'integration-service': 3007,
  'marketplace-service': 3008,
  'scanning-service': 3009,
  'notification-service': 3010,
  'blockchain-service': 3011,
  'blockchain-indexer': 3012,
  'file-service': 3013,
  'minting-service': 3014,
  'transfer-service': 3015,
  'analytics-service': 3016,
  'search-service': 3017,
  'compliance-service': 3018,
  'monitoring-service': 3019,
  'queue-service': 3020
};

// Check each service
Object.entries(expectedPorts).forEach(([service, expectedPort]) => {
  const servicePath = path.join(servicesDir, service);
  if (!fs.existsSync(servicePath)) return;
  
  // Check for PORT in main file
  const mainFiles = ['src/index.ts', 'src/index.js', 'src/server.ts', 'src/server.js'];
  for (const file of mainFiles) {
    const filePath = path.join(servicePath, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const portMatch = content.match(/process\.env\.PORT\s*\|\|\s*(\d+)/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        if (port !== expectedPort) {
          errors.push(`${service}: expected port ${expectedPort}, found ${port}`);
        }
        if (portMap.has(port)) {
          errors.push(`Port ${port} used by both ${service} and ${portMap.get(port)}`);
        }
        portMap.set(port, service);
      }
      break;
    }
  }
});

if (errors.length > 0) {
  console.error('❌ Port configuration errors:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
} else {
  console.log('✅ All ports correctly configured');
}
