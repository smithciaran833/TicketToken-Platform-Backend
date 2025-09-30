export const mockSyncHistory = [
  {
    id: 'sync-1',
    provider: 'stripe',
    venueId: 'test-venue-id',
    status: 'completed',
    startedAt: '2024-01-15T10:00:00Z',
    completedAt: '2024-01-15T10:05:00Z',
    itemsSynced: 1000,
    errors: 0
  },
  {
    id: 'sync-2',
    provider: 'stripe',
    venueId: 'test-venue-id',
    status: 'failed',
    startedAt: '2024-01-14T10:00:00Z',
    completedAt: '2024-01-14T10:02:00Z',
    itemsSynced: 250,
    errors: 5,
    errorMessage: 'Rate limit exceeded'
  }
];

export const mockFieldMappings = {
  stripe: {
    customer: [
      { source: 'email', target: 'customer_email', required: true },
      { source: 'name', target: 'customer_name', required: false }
    ],
    payment: [
      { source: 'amount', target: 'payment_amount', required: true },
      { source: 'currency', target: 'payment_currency', required: true }
    ]
  }
};
