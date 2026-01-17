const { initRedis } = require('../../dist/config/redis');
const { buildApp } = require('../../dist/app');

describe('Minimal JS', () => {
  let app;

  beforeAll(async () => {
    await initRedis();
    app = await buildApp();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('builds app', async () => {
    expect(app).toBeDefined();
  });
});
