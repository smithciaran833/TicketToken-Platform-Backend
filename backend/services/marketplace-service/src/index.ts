import 'dotenv/config';  // This loads .env file
import { startServer } from './server';
import { logger } from './utils/logger';

startServer().catch(error => {
  logger.error('Failed to start marketplace service:', error);
  process.exit(1);
});
