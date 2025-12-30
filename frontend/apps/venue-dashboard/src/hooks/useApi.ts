/**
 * useApi Hook
 * 
 * React hook for making API calls with loading and error states.
 * 
 * Usage:
 * const { data, loading, error, refetch } = useApi<Event[]>(`/venues/${venueId}/events`);
 */

import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useApi<T>(endpoint: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!endpoint);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await api.get(endpoint);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * useMutation Hook
 * 
 * React hook for making mutating API calls (POST, PUT, DELETE).
 * 
 * Usage:
 * const { mutate, loading, error } = useMutation<Event>('POST', `/venues/${venueId}/events`);
 * const newEvent = await mutate(eventData);
 */

interface UseMutationResult<T, D = unknown> {
  mutate: (data?: D) => Promise<T | null>;
  loading: boolean;
  error: Error | null;
}

export function useMutation<T, D = unknown>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string
): UseMutationResult<T, D> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (data?: D): Promise<T | null> => {
    setLoading(true);
    setError(null);
    
    try {
      let result;
      switch (method) {
        case 'POST':
          result = await api.post(endpoint, data);
          break;
        case 'PUT':
          result = await api.put(endpoint, data);
          break;
        case 'PATCH':
          result = await api.patch(endpoint, data);
          break;
        case 'DELETE':
          result = await api.delete(endpoint);
          break;
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [method, endpoint]);

  return { mutate, loading, error };
}

export default useApi;
