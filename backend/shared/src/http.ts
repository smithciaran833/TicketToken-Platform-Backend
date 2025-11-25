import axios from 'axios';

export function createAxiosInstance(baseURL: string, timeout = 10000) {
  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  instance.interceptors.request.use(
    (config: any) => {
      // Add any auth headers or request modifications here
      return config;
    },
    (error: any) => Promise.reject(error)
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response: any) => response,
    async (error: any) => {
      // Handle errors globally
      if (error.response?.status === 401) {
        // Handle unauthorized
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

export default { createAxiosInstance };
