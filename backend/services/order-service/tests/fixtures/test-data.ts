export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
};

export const mockEvent = {
  id: 'event-123',
  name: 'Test Event',
  startDate: new Date('2025-12-01'),
};

export const mockTicketType = {
  id: 'ticket-type-123',
  name: 'General Admission',
  price: 5000,
  available: 100,
};

export const mockOrder = {
  id: 'order-123',
  userId: 'user-123',
  eventId: 'event-123',
  orderNumber: 'ORD-20251106-ABC123',
  status: 'PENDING',
  subtotalCents: 10000,
  platformFeeCents: 500,
  processingFeeCents: 300,
  taxCents: 800,
  discountCents: 0,
  totalCents: 11600,
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockOrderItem = {
  id: 'item-123',
  orderId: 'order-123',
  ticketTypeId: 'ticket-type-123',
  quantity: 2,
  unitPriceCents: 5000,
  totalPriceCents: 10000,
};
