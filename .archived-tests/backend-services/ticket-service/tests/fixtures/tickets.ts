export const mockTicket = {
  id: 'ticket-123',
  event_id: 'event-456',
  ticket_type_id: 'type-789',
  owner_id: 'user-123',
  status: 'active',
  qr_code: 'QR123456',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
};

export const mockOrder = {
  id: 'order-123',
  order_number: 'ORD-12345678',
  user_id: 'user-123',
  event_id: 'event-456',
  status: 'completed',
  total_amount: 10000,
  items: [
    { tier_id: 'tier-1', quantity: 2, price: 5000 }
  ]
};

export const mockTransfer = {
  id: 'transfer-123',
  ticket_id: 'ticket-123',
  from_user_id: 'user-123',
  to_user_id: 'user-456',
  transfer_code: 'TRANS123',
  status: 'pending'
};

export const mockTicketType = {
  id: 'type-123',
  event_id: 'event-456',
  name: 'VIP',
  price: 15000,
  available_quantity: 100,
  total_quantity: 200
};
