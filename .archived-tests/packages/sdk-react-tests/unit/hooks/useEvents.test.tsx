import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TicketTokenProvider, useEvents, useEvent } from '../../../src';

const mockClient = {
  events: {
    list: jest.fn(),
    get: jest.fn(),
  },
};

jest.mock('@tickettoken/sdk-typescript', () => ({
  TicketToken: jest.fn(() => mockClient),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TicketTokenProvider config={{ apiKey: 'test-key', environment: 'development' }}>
    {children}
  </TicketTokenProvider>
);

describe('useEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches events on mount', async () => {
    const mockEvents = { data: [{ id: '1', name: 'Test Event' }] };
    mockClient.events.list.mockResolvedValue(mockEvents);

    const { result } = renderHook(() => useEvents(), { wrapper });

    expect(result.current.loading).toBe(false);
    
    await waitFor(() => {
      expect(result.current.events).toEqual(mockEvents.data);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  it('handles errors', async () => {
    const mockError = new Error('Failed to fetch');
    mockClient.events.list.mockRejectedValue(mockError);

    const { result } = renderHook(() => useEvents(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toEqual(mockError);
      expect(result.current.loading).toBe(false);
    });
  });

  it('does not auto-load when autoLoad is false', () => {
    const { result } = renderHook(() => useEvents({ autoLoad: false }), { wrapper });

    expect(mockClient.events.list).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

describe('useEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches event by id', async () => {
    const mockEvent = { id: '1', name: 'Test Event' };
    mockClient.events.get.mockResolvedValue(mockEvent);

    const { result } = renderHook(() => useEvent({ eventId: '1' }), { wrapper });

    await waitFor(() => {
      expect(result.current.event).toEqual(mockEvent);
      expect(result.current.loading).toBe(false);
    });
  });
});
