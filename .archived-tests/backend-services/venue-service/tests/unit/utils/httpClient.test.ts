import { HttpClient } from '../../../src/utils/httpClient';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HTTP Client Utils', () => {
  let httpClient: HttpClient;
  let mockLogger: any;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };

    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    httpClient = new HttpClient('https://api.example.com', mockLogger);
  });

  // =============================================================================
  // Constructor - 2 test cases
  // =============================================================================

  describe('Constructor', () => {
    it('should create axios instance with base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.example.com',
        timeout: 10000,
      });
    });

    it('should setup interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // HTTP Methods - 4 test cases
  // =============================================================================

  describe('HTTP Methods', () => {
    beforeEach(() => {
      mockAxiosInstance.request.mockResolvedValue({ data: 'success' });
    });

    it('should make GET request', async () => {
      await httpClient.get('/test');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/test',
        })
      );
    });

    it('should make POST request with data', async () => {
      await httpClient.post('/test', { name: 'Test' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/test',
          data: { name: 'Test' },
        })
      );
    });

    it('should make PUT request with data', async () => {
      await httpClient.put('/test/123', { name: 'Updated' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/test/123',
          data: { name: 'Updated' },
        })
      );
    });

    it('should make DELETE request', async () => {
      await httpClient.delete('/test/123');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/test/123',
        })
      );
    });
  });

  // =============================================================================
  // Circuit Breaker Integration - 2 test cases
  // =============================================================================

  describe('Circuit Breaker Integration', () => {
    it('should use circuit breaker for requests', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: 'success' });

      const result = await httpClient.get('/test');

      expect(result).toEqual({ data: 'success' });
    });

    it('should handle request failures', async () => {
      mockAxiosInstance.request.mockRejectedValue(new Error('Network error'));

      await expect(httpClient.get('/test')).rejects.toThrow('Network error');
    });
  });
});
