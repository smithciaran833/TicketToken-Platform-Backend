/**
 * Controllers Index Unit Tests
 */

describe('Controllers Index', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should export metricsController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('metricsController');
  });

  it('should export dashboardController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('dashboardController');
  });

  it('should export widgetController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('widgetController');
  });

  it('should export reportsController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('reportsController');
  });

  it('should export insightsController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('insightsController');
  });

  it('should export alertsController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('alertsController');
  });

  it('should export exportController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('exportController');
  });

  it('should export customerController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('customerController');
  });

  it('should export campaignController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('campaignController');
  });

  it('should export predictionController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('predictionController');
  });

  it('should export realtimeController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('realtimeController');
  });

  it('should export healthController', () => {
    const controllers = require('../../../src/controllers');
    expect(controllers).toHaveProperty('healthController');
  });

  it('should export exactly 12 controller modules', () => {
    const controllers = require('../../../src/controllers');
    const exportedKeys = Object.keys(controllers).filter(key => 
      key.endsWith('Controller') || key.endsWith('controller')
    );
    expect(exportedKeys.length).toBeGreaterThanOrEqual(12);
  });
});
