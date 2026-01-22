import path from 'path';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: path.join(__dirname, '../../../.env.test') });

/**
 * No-op functions for compatibility - we use local infra
 */
export async function startAllContainers(): Promise<void> {
  console.log('[Containers] Using local infrastructure from .env.test');
}

export function setContainerEnvVars(): void {
  console.log('[Containers] Environment loaded from .env.test');
}

export async function stopAllContainers(): Promise<void> {
  console.log('[Containers] No containers to stop (using local infra)');
}
