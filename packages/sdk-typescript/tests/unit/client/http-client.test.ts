import axios from 'axios';
import { HTTPClient } from '../../../src/client/http-client';
import { ResolvedSDKConfig } from '../../../src/types/config';
import {
  AuthenticationError,
  NotFoundError,
  ServerError,
  NetworkError,
} from '../../../src/errors';
import { createAxiosError, createNetworkError } from '../../setup';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HTTPClient', () => {
  let client: HTTPClient;
  let mockAxiosInstance: any;
  let config: ResolvedSDKConfig;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key',
      environment: 'production',
      baseUrl: 'https://api.tickettoken.com',
      timeout: 30000,
      maxRetries: 3,
      debug: false,
      headers: { 'X-Custom': 'test' },
    };

    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      defaults: {
        baseURL: config.baseUrl,
        timeout: config.timeout,
        headers: {},
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new HTTPClient(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: config.baseUrl,
        timeout: config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TicketToken-SDK/1.0.0',
          'X-Custom': 'test',
        },
        httpAgent: undefined,
        httpsAgent: undefined,
      });
    });

    it('should setup interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('GET request', () => {
    it('should make GET request and return data', async () => {
      const mockData = { id: '123', name: 'Test' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await client.get('/events');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events', undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass config to GET request', async () => {
      const mockData = { id: '123' };
      const requestConfig = { params: { page: 1 } };
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      await client.get('/events', requestConfig);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events', requestConfig);
    });

    it('should throw error on failed GET request', async () => {
      const error = createAxiosError(404, 'Not found');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.get('/events/123')).rejects.toThrow(NotFoundError);
    });
  });

  describe('POST request', () => {
    it('should make POST request and return data', async () => {
      const mockData = { id: '123' };
      const postData = { name: 'New Event' };
      mockAxiosInstance.post.mockResolvedValue({ data: mockData });

      const result = await client.post('/events', postData);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/events', postData, undefined);
      expect(result).toEqual(mockData);
    });

    it('should throw error on failed POST request', async () => {
      const error = createAxiosError(500, 'Server error');
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(client.post('/events', {})).rejects.toThrow(ServerError);
    });
  });

  describe('PUT request', () => {
    it('should make PUT request and return data', async () => {
      const mockData = { id: '123', name: 'Updated' };
      const putData = { name: 'Updated' };
      mockAxiosInstance.put.mockResolvedValue({ data: mockData });

      const result = await client.put('/events/123', putData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/events/123', putData, undefined);
      expect(result).toEqual(mockData);
    });
  });

  describe('PATCH request', () => {
    it('should make PATCH request and return data', async () => {
      const mockData = { id: '123', name: 'Patched' };
      const patchData = { name: 'Patched' };
      mockAxiosInstance.patch.mockResolvedValue({ data: mockData });

      const result = await client.patch('/events/123', patchData);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/events/123', patchData, undefined);
      expect(result).toEqual(mockData);
    });
  });

  describe('DELETE request', () => {
    it('should make DELETE request and return data', async () => {
      const mockData = { success: true };
      mockAxiosInstance.delete.mockResolvedValue({ data: mockData });

      const result = await client.delete('/events/123');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/events/123', undefined);
      expect(result).toEqual(mockData);
    });
  });

  describe('Custom request', () => {
    it('should make custom request and return data', async () => {
      const mockData = { data: 'custom' };
      const requestConfig = { method: 'GET', url: '/custom' };
      mockAxiosInstance.request.mockResolvedValue({ data: mockData });

      const result = await client.request(requestConfig as any);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(requestConfig);
      expect(result).toEqual(mockData);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      client.updateConfig({ timeout: 60000 });

      const updatedConfig = client.getConfig();
      expect(updatedConfig.timeout).toBe(60000);
    });

    it('should update axios defaults for baseUrl', () => {
      client.updateConfig({ baseUrl: 'https://new-api.example.com' });

      expect(mockAxiosInstance.defaults.baseURL).toBe('https://new-api.example.com');
    });

    it('should update axios defaults for timeout', () => {
      client.updateConfig({ timeout: 45000 });

      expect(mockAxiosInstance.defaults.timeout).toBe(45000);
    });

    it('should merge headers when updating', () => {
      client.updateConfig({ headers: { 'X-New-Header': 'value' } });

      expect(mockAxiosInstance.defaults.headers).toEqual({
        'X-New-Header': 'value',
      });
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const currentConfig = client.getConfig();

      expect(currentConfig.apiKey).toBe('test-api-key');
      expect(currentConfig.baseUrl).toBe('https://api.tickettoken.com');
      expect(currentConfig.timeout).toBe(30000);
    });

    it('should return a copy of config', () => {
      const config1 = client.getConfig();
      const config2 = client.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('Error handling', () => {
    it('should handle authentication errors', async () => {
      const error = createAxiosError(401, 'Unauthorized');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.get('/events')).rejects.toThrow(AuthenticationError);
    });

    it('should handle network errors', async () => {
      const error = createNetworkError();
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.get('/events')).rejects.toThrow(NetworkError);
    });

    it('should handle server errors', async () => {
      const error = createAxiosError(500, 'Internal server error');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.get('/events')).rejects.toThrow(ServerError);
    });
  });

  describe('Debug mode', () => {
    it('should not log in non-debug mode', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mockData = { id: '123' };
      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      await client.get('/events');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
