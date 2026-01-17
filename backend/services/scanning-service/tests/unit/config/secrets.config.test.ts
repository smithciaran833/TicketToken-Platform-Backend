// @ts-nocheck
import { SECRETS_CONFIG } from '../../../src/config/secrets.config';

describe('Secrets Config', () => {
  it('should export SECRETS_CONFIG object', () => {
    expect(SECRETS_CONFIG).toBeDefined();
    expect(typeof SECRETS_CONFIG).toBe('object');
  });

  it('should contain POSTGRES_PASSWORD config', () => {
    expect(SECRETS_CONFIG.POSTGRES_PASSWORD).toBeDefined();
    expect(SECRETS_CONFIG.POSTGRES_PASSWORD.secretName).toBe('tickettoken/production/postgres-password');
    expect(SECRETS_CONFIG.POSTGRES_PASSWORD.envVarName).toBe('POSTGRES_PASSWORD');
  });

  it('should contain POSTGRES_USER config', () => {
    expect(SECRETS_CONFIG.POSTGRES_USER).toBeDefined();
    expect(SECRETS_CONFIG.POSTGRES_USER.secretName).toBe('tickettoken/production/postgres-user');
    expect(SECRETS_CONFIG.POSTGRES_USER.envVarName).toBe('POSTGRES_USER');
  });

  it('should contain POSTGRES_DB config', () => {
    expect(SECRETS_CONFIG.POSTGRES_DB).toBeDefined();
    expect(SECRETS_CONFIG.POSTGRES_DB.secretName).toBe('tickettoken/production/postgres-db');
    expect(SECRETS_CONFIG.POSTGRES_DB.envVarName).toBe('POSTGRES_DB');
  });

  it('should contain REDIS_PASSWORD config', () => {
    expect(SECRETS_CONFIG.REDIS_PASSWORD).toBeDefined();
    expect(SECRETS_CONFIG.REDIS_PASSWORD.secretName).toBe('tickettoken/production/redis-password');
    expect(SECRETS_CONFIG.REDIS_PASSWORD.envVarName).toBe('REDIS_PASSWORD');
  });

  it('should have all entries with secretName and envVarName', () => {
    Object.values(SECRETS_CONFIG).forEach((config: any) => {
      expect(config.secretName).toBeDefined();
      expect(config.envVarName).toBeDefined();
      expect(typeof config.secretName).toBe('string');
      expect(typeof config.envVarName).toBe('string');
    });
  });

  it('should have 4 secret configurations', () => {
    const keys = Object.keys(SECRETS_CONFIG);
    expect(keys.length).toBe(4);
  });
});
