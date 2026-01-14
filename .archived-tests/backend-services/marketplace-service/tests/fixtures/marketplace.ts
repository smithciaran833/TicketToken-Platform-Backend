export const mockListing = {
  id: 'listing-123',
  ticket_id: 'ticket-456',
  user_id: 'user-789',
  price_cents: 15000,
  currency: 'USD',
  status: 'active',
  expires_at: '2024-12-31T23:59:59Z',
  created_at: '2024-01-01T00:00:00Z'
};

export const mockOffer = {
  id: 'offer-123',
  listing_id: 'listing-123',
  buyer_id: 'user-456',
  amount_cents: 14000,
  currency: 'USD',
  status: 'pending',
  created_at: '2024-01-01T00:00:00Z'
};

export const mockSettlement = {
  id: 'settlement-123',
  venue_id: 'venue-456',
  amount_cents: 50000,
  currency: 'USD',
  status: 'pending',
  destination: 'bank_account_123'
};

export const mockPriceSuggestion = {
  event_id: 'event-456',
  suggested_price: 12000,
  min_price: 10000,
  max_price: 15000,
  average_price: 12500
};
