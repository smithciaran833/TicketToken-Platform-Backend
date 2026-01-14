import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

export async function setupTestApp(): Promise<FastifyInstance> {
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = 'tickettoken_venues_test';
  
  const app = await buildApp();
  await app.ready();
  
  return app;
}

export async function cleanupDatabase(db: any) {
  const tables = [
    'venue_documents',
    'venue_layouts', 
    'venue_staff',
    'venue_compliance',
    'venue_integrations',
    'venues'
  ];
  
  for (const table of tables) {
    await db(table).truncate();
  }
}
