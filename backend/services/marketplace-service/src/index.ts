import 'dotenv/config';  // This loads .env file
import { startServer } from './server';

startServer().catch(error => {
  console.error('Failed to start marketplace service:', error);
  process.exit(1);
});
