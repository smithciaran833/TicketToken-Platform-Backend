import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { secretsManager } from '../../../../shared/utils/secrets-manager';
import { SECRETS_CONFIG } from '../../../../shared/config/secrets.config';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'SecretsLoader' });

export async function loadSecrets() {
  const serviceName = process.env.SERVICE_NAME || 'unknown-service';
  log.info({ serviceName }, 'Loading secrets...');

  try {
    // Common secrets needed by most services
    const commonSecrets = [
      SECRETS_CONFIG.POSTGRES_PASSWORD,
      SECRETS_CONFIG.POSTGRES_USER,
      SECRETS_CONFIG.POSTGRES_DB,
      SECRETS_CONFIG.REDIS_PASSWORD,
    ];

    const secrets = await secretsManager.getSecrets(commonSecrets);

    log.info({ serviceName }, 'Secrets loaded successfully');

    return secrets;
  } catch (error: any) {
    log.error({ serviceName, error: error.message }, 'Failed to load secrets');
    throw new Error('Cannot start service without required secrets');
  }
}
