import { useState, useCallback } from 'react';
import { useTicketTokenClient } from '../context/TicketTokenContext';

interface UseMyTicketsResult {
  tickets: any[];
  loading: boolean;
  error: Error | null;
  fetchTickets: () => Promise<void>;
}

export const useMyTickets = (): UseMyTicketsResult => {
  const client = useTicketTokenClient();
  
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await client.tickets.getMyTickets();
      setTickets(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [client]);

  return {
    tickets,
    loading,
    error,
    fetchTickets,
  };
};

interface UsePurchaseTicketsResult {
  purchaseTickets: (params: any) => Promise<any>;
  loading: boolean;
  error: Error | null;
}

export const usePurchaseTickets = (): UsePurchaseTicketsResult => {
  const client = useTicketTokenClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const purchaseTickets = useCallback(async (params: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.tickets.purchase(params);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return {
    purchaseTickets,
    loading,
    error,
  };
};

interface UseTransferTicketResult {
  transferTicket: (params: any) => Promise<any>;
  loading: boolean;
  error: Error | null;
}

export const useTransferTicket = (): UseTransferTicketResult => {
  const client = useTicketTokenClient();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transferTicket = useCallback(async (params: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.tickets.transfer(params);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return {
    transferTicket,
    loading,
    error,
  };
};
