import path from 'path';
import dotenv from 'dotenv';

// Load test env BEFORE any other imports
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import { initRedis } from '../../src/config/redis';
import { buildApp } from '../../src/app';

describe('Minimal', () => {
  let app: any;

  beforeAll(async () => {
    await initRedis();
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  it('builds app', async () => {
    expect(app).toBeDefined();
  });
});
