export const mockVenue = {
  id: 'venue-123',
  name: 'Test Arena',
  address: '123 Main St, Test City, TC 12345',
  capacity: 5000,
  timezone: 'America/New_York',
  created_by: 'user-123',
  tenant_id: 'tenant-123',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01')
};

export const mockLayout = {
  id: 'layout-123',
  venue_id: 'venue-123',
  name: 'Main Floor Layout',
  sections: [
    {
      name: 'Section A',
      rows: 10,
      seats_per_row: 20
    }
  ]
};

export const mockSettings = {
  venue_id: 'venue-123',
  admission_policy: 'standard',
  scanning_enabled: true,
  payout_preferences: {
    method: 'bank_transfer',
    frequency: 'weekly'
  }
};

export const mockStaff = {
  user_id: 'user-456',
  venue_id: 'venue-123',
  roles: ['staff', 'scanner']
};

export const mockIntegration = {
  id: 'integration-123',
  venue_id: 'venue-123',
  provider: 'ticketmaster',
  config: {
    api_key: 'encrypted_key'
  },
  status: 'active'
};

export const adminToken = 'mock-admin-jwt-token';
export const vendorToken = 'mock-vendor-jwt-token';
export const userToken = 'mock-user-jwt-token';
export const complianceToken = 'mock-compliance-jwt-token';
