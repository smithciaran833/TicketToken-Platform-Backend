import { startAllContainers, setContainerEnvVars, stopAllContainers } from './helpers/containers';
import { getTestDb, runMigrations, truncateAllTables, closeDb } from './helpers/db';
import { getTestRedis, flushRedis, closeRedis } from './helpers/redis';
import { getTestMongoDB, clearAllCollections, closeMongoDB } from './helpers/mongodb';

beforeAll(async () => {
  console.log('[Setup] Starting test containers...');
  await startAllContainers();
  setContainerEnvVars();
  
  // Initialize connections
  await getTestMongoDB();
  getTestDb();
  getTestRedis();
  
  // Run migrations
  await runMigrations();
  
  console.log('[Setup] Test environment ready');
}, 120000);

beforeEach(async () => {
  // Clean state between tests
  await truncateAllTables();
  await flushRedis();
  await clearAllCollections();
});

afterAll(async () => {
  console.log('[Teardown] Cleaning up...');
  await closeDb();
  await closeRedis();
  await closeMongoDB();
  await stopAllContainers();
  console.log('[Teardown] Complete');
}, 30000);
