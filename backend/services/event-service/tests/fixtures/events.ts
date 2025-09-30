export const mockEvent = {
  id: 'event-123',
  venue_id: 'venue-456',
  name: 'Test Concert',
  description: 'Amazing concert',
  start_date: '2024-12-01T19:00:00Z',
  end_date: '2024-12-01T23:00:00Z',
  status: 'PUBLISHED',
  total_tickets: 1000,
  available_tickets: 800,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
};

export const mockTier = {
  id: 'tier-123',
  event_id: 'event-123',
  name: 'General Admission',
  price_cents: 5000,
  currency: 'USD',
  total_qty: 500,
  available_qty: 400
};

export const mockPolicy = {
  event_id: 'event-123',
  scanning_enabled: true,
  entry_rules: {
    no_reentry: false,
    id_required: true
  }
};
