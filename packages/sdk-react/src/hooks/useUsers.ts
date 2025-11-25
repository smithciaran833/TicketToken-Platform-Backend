import { useState, useEffect, useCallback } from 'react';
import { useTicketTokenClient } from '../context/TicketTokenContext';

interface UseCurrentUserOptions {
  autoLoad?: boolean;
}

interface UseCurrentUserResult {
  user: any | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useCurrentUser = (
  options: UseCurrentUserOptions = {}
): UseCurrentUserResult => {
  const { autoLoad = true } = options;
  const client = useTicketTokenClient();
  
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await client.users.me();
      setUser(response);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (autoLoad) {
      fetchUser();
    }
  }, [autoLoad, fetchUser]);

  return {
    user,
    loading,
    error,
    refetch: fetchUser,
  };
};

interface UseUpdateProfileResult {
  updateProfile: (data: any) => Promise<any>;
  loading: boolean;
  error: Error | null;
}

export const useUpdateProfile = (): UseUpdateProfileResult => {
  const client = useTicketTokenClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateProfile = useCallback(async (data: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.users.updateProfile(data);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return {
    updateProfile,
    loading,
    error,
  };
};
