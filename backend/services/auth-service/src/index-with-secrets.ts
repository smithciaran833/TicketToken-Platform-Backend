import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { loadSecrets } from './config/secrets';

async function startServer() {
  try {
    console.log('🚀 Starting Auth Service...');
    
    // Load secrets BEFORE starting the server
    const secrets = await loadSecrets();
    
    // Now secrets are loaded, you can use them
    console.log(`Database User: ${secrets.POSTGRES_USER}`);
    console.log(`Database Name: ${secrets.POSTGRES_DB}`);
    console.log('Redis Password: [REDACTED]');
    console.log('JWT Secrets: [REDACTED]');
    
    console.log('✅ Auth Service started successfully');
  } catch (error: any) {
    console.error('💥 Failed to start Auth Service:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();
