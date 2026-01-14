import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { secretsManager } from '../utils/secrets-manager';
import { SECRETS_CONFIG } from './secrets.config';

export async function loadSecrets(): Promise<Record<string, string>> {
  const serviceName = process.env.SERVICE_NAME || 'unknown-service';
  console.log(`[${serviceName}] Loading secrets...`);
  
  try {
    // Common secrets needed by most services
    const commonSecrets = [
      SECRETS_CONFIG.POSTGRES_PASSWORD,
      SECRETS_CONFIG.POSTGRES_USER,
      SECRETS_CONFIG.POSTGRES_DB,
      SECRETS_CONFIG.REDIS_PASSWORD,
    ];
    
    const secrets = await secretsManager.getSecrets(commonSecrets);
    
    console.log(`[${serviceName}] ✅ Secrets loaded successfully`);
    
    return secrets;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${serviceName}] ❌ Failed to load secrets:`, errorMessage);
    throw new Error('Cannot start service without required secrets');
  }
}
