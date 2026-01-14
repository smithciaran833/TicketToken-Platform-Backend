/**
 * Jest setup and test utilities
 */

// Mock data factories
export const mockEvent = {
  id: 'evt_123',
  name: 'Test Concert',
  description: 'A test concert',
  venue: 'Test Venue',
  location: 'Test City',
  startDate: '2024-12-31T20:00:00Z',
  endDate: '2024-12-31T23:00:00Z',
  capacity: 1000,
  ticketTypes: [
    {
      id: 'tt_1',
      name: 'General Admission',
      price: 50,
      currency: 'USD',
      quantity: 500,
    },
  ],
  status: 'published',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

export const mockTicket = {
  id: 'tkt_123',
  eventId: 'evt_123',
  userId: 'usr_123',
  ticketType: 'general-admission',
  price: 50,
  currency: 'USD',
  status: 'active',
  qrCode: 'QR123',
  metadata: {},
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

export const mockUser = {
  id: 'usr_123',
  email: 'test@example.com',
  name: 'Test User',
  walletAddress: '0x123',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

export const mockPaginatedResponse = {
  data: [],
  pagination: {
    page: 1,
    limit: 10,
    total: 100,
    totalPages: 10,
  },
};

// Mock axios error factory
export const createAxiosError = (status: number, message: string, data?: any) => {
  const error: any = new Error(message);
  error.response = {
    status,
    data: data || { message },
    headers: {},
  };
  error.config = {};
  return error;
};

// Mock axios network error
export const createNetworkError = () => {
  const error: any = new Error('Network Error');
  error.request = {};
  error.config = {};
  return error;
};

// Mock axios timeout error
export const createTimeoutError = () => {
  const error: any = new Error('timeout of 30000ms exceeded');
  error.code = 'ECONNABORTED';
  error.request = {};
  error.config = {};
  return error;
};
