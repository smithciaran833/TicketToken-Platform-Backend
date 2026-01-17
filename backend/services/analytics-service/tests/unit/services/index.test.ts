/**
 * Services Index Unit Tests
 */

describe('Services Index', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should export metricsService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('metricsService');
  });

  it('should export aggregationService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('aggregationService');
  });

  it('should export customerIntelligenceService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('customerIntelligenceService');
  });

  it('should export predictionService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('predictionService');
  });

  it('should export messageGatewayService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('messageGatewayService');
  });

  it('should export attributionService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('attributionService');
  });

  it('should export exportService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('exportService');
  });

  it('should export alertService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('alertService');
  });

  it('should export anonymizationService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('anonymizationService');
  });

  it('should export websocketService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('websocketService');
  });

  it('should export CacheService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('CacheService');
  });

  it('should export validationService', () => {
    const services = require('../../../src/services');
    expect(services).toHaveProperty('validationService');
  });
});
