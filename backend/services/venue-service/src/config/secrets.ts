import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { secretsManager } from '@tickettoken/shared/utils/secrets-manager';
import { SECRETS_CONFIG } from '@tickettoken/shared/config/secrets.config';

export async function loadSecrets() {
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
  } catch (error: any) {
    console.error(`[${serviceName}] ❌ Failed to load secrets:`, error.message);
    throw new Error('Cannot start service without required secrets');
  }
}
