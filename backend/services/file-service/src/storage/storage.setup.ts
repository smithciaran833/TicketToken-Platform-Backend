import fs from 'fs/promises';
import { logger } from '../utils/logger';

export async function setupStorage(): Promise<void> {
  const dirs = [
    './uploads',
    './uploads/images',
    './uploads/documents',
    './uploads/videos',
    './temp'
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.debug(`Directory created/verified: ${dir}`);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), dir }, 'Failed to create directory');
    }
  }
  
  logger.info('Storage directories initialized');
}
