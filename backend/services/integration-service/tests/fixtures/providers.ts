export const mockProviders = {
  stripe: {
    id: 'stripe',
    name: 'Stripe',
    category: 'payment',
    status: 'connected',
    connected: true,
    lastSync: '2024-01-15T10:00:00Z',
    config: {
      apiKey: 'sk_test_123',
      webhookSecret: 'whsec_test_123'
    }
  },
  square: {
    id: 'square',
    name: 'Square',
    category: 'payment',
    status: 'disconnected',
    connected: false,
    lastSync: null,
    config: {}
  },
  mailchimp: {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'marketing',
    status: 'connected',
    connected: true,
    lastSync: '2024-01-14T15:00:00Z',
    config: {
      apiKey: 'mc_test_123',
      listId: 'list_123'
    }
  },
  quickbooks: {
    id: 'quickbooks',
    name: 'QuickBooks',
    category: 'accounting',
    status: 'error',
    connected: true,
    lastSync: '2024-01-13T08:00:00Z',
    error: 'Authentication failed',
    config: {}
  }
};

export const mockSyncJob = {
  id: 'sync-job-123',
  provider: 'stripe',
  venueId: 'test-venue-id',
  status: 'running',
  progress: 45,
  startedAt: '2024-01-15T10:00:00Z',
  itemsSynced: 450,
  totalItems: 1000
};

export const mockMappingTemplate = {
  provider: 'stripe',
  fields: [
    { source: 'customer.email', target: 'email', transform: 'lowercase' },
    { source: 'customer.name', target: 'fullName', transform: null },
    { source: 'amount', target: 'totalAmount', transform: 'cents_to_dollars' }
  ]
};

export const mockWebhookEvent = {
  stripe: {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_123',
        amount: 5000,
        currency: 'usd'
      }
    }
  },
  square: {
    merchant_id: 'merchant_123',
    type: 'payment.created',
    event_id: 'evt_456',
    data: {
      type: 'payment',
      id: 'payment_456'
    }
  }
};

export const mockOAuthTokens = {
  access_token: 'access_token_123',
  refresh_token: 'refresh_token_123',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'read write'
};
