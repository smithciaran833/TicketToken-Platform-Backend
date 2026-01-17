// @ts-nocheck
import { loadSecrets } from '../../../src/config/secrets';
import { secretsManager } from '../../../src/utils/secrets-manager';

jest.mock('dotenv');

describe('Secrets Loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SERVICE_NAME = 'test-service';
  });

  describe('loadSecrets', () => {
    it('should call secretsManager.getSecrets with common secrets', async () => {
      const mockGetSecrets = jest.spyOn(secretsManager, 'getSecrets').mockResolvedValue({
        POSTGRES_PASSWORD: 'pass',
        POSTGRES_USER: 'user',
        POSTGRES_DB: 'db',
        REDIS_PASSWORD: 'redis'
      });

      await loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ envVarName: 'POSTGRES_PASSWORD' }),
          expect.objectContaining({ envVarName: 'POSTGRES_USER' }),
          expect.objectContaining({ envVarName: 'POSTGRES_DB' }),
          expect.objectContaining({ envVarName: 'REDIS_PASSWORD' })
        ])
      );
    });

    it('should return secrets record on success', async () => {
      const mockSecrets = {
        POSTGRES_PASSWORD: 'pass',
        POSTGRES_USER: 'user',
        POSTGRES_DB: 'db',
        REDIS_PASSWORD: 'redis'
      };

      jest.spyOn(secretsManager, 'getSecrets').mockResolvedValue(mockSecrets);

      const result = await loadSecrets();

      expect(result).toEqual(mockSecrets);
    });

    it('should throw error when secretsManager fails', async () => {
      jest.spyOn(secretsManager, 'getSecrets').mockRejectedValue(new Error('AWS Error'));

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should log service name', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(secretsManager, 'getSecrets').mockResolvedValue({});

      await loadSecrets();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test-service'));
      consoleSpy.mockRestore();
    });

    it('should use default service name when not set', async () => {
      delete process.env.SERVICE_NAME;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(secretsManager, 'getSecrets').mockResolvedValue({});

      await loadSecrets();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-service'));
      consoleSpy.mockRestore();
    });

    it('should load 4 common secrets', async () => {
      const mockGetSecrets = jest.spyOn(secretsManager, 'getSecrets').mockResolvedValue({});

      await loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledWith(expect.arrayContaining([
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      ]));
      expect(mockGetSecrets.mock.calls[0][0].length).toBe(4);
    });
  });
});
