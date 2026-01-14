export const mockPaymentIntent = {
  id: 'pi_123',
  venue_id: 'venue-456',
  event_id: 'event-789',
  amount: 10000,
  currency: 'USD',
  status: 'pending',
  client_secret: 'pi_123_secret',
  created_at: '2024-01-01T00:00:00Z'
};

export const mockTransaction = {
  id: 'txn_123',
  order_id: 'order-456',
  amount: 10000,
  currency: 'USD',
  status: 'succeeded',
  payment_method: 'card',
  created_at: '2024-01-01T00:00:00Z'
};

export const mockPayout = {
  id: 'po_123',
  venue_id: 'venue-456',
  amount: 50000,
  currency: 'USD',
  status: 'pending',
  destination: 'bank_account_123'
};

export const mockGroupPayment = {
  id: 'grp_123',
  total_amount: 20000,
  currency: 'USD',
  members: [
    { member_id: 'user-1', share: 10000, paid: true },
    { member_id: 'user-2', share: 10000, paid: false }
  ]
};

export const mockWebhookEvent = {
  id: 'evt_123',
  type: 'payment_intent.succeeded',
  data: { object: mockPaymentIntent }
};
