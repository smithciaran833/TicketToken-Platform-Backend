import { useState, useEffect, useCallback } from 'react';
import { useTicketTokenClient } from '../context/TicketTokenContext';

interface UseEventsOptions {
  limit?: number;
  offset?: number;
  autoLoad?: boolean;
}

interface UseEventsResult {
  events: any[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useEvents = (options: UseEventsOptions = {}): UseEventsResult => {
  const { limit = 10, offset = 0, autoLoad = true } = options;
  const client = useTicketTokenClient();
  
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await client.events.list({ limit, offset });
      setEvents(response.data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [client, limit, offset]);

  useEffect(() => {
    if (autoLoad) {
      fetchEvents();
    }
  }, [autoLoad, fetchEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchEvents,
  };
};

interface UseEventOptions {
  eventId: string;
  autoLoad?: boolean;
}

interface UseEventResult {
  event: any | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useEvent = (options: UseEventOptions): UseEventResult => {
  const { eventId, autoLoad = true } = options;
  const client = useTicketTokenClient();
  
  const [event, setEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await client.events.get(eventId);
      setEvent(response);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [client, eventId]);

  useEffect(() => {
    if (autoLoad && eventId) {
      fetchEvent();
    }
  }, [autoLoad, eventId, fetchEvent]);

  return {
    event,
    loading,
    error,
    refetch: fetchEvent,
  };
};
