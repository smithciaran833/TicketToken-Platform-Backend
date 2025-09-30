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
      logger.error(`Failed to create directory ${dir}:`, error);
    }
  }
  
  logger.info('Storage directories initialized');
}
