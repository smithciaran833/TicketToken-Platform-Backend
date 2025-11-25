export const mockEvent = {
  id: 'event-123',
  tenant_id: 'tenant-123',
  venue_id: 'venue-123',
  name: 'Test Concert',
  slug: 'test-venue-test-concert',
  description: 'A great test concert',
  short_description: 'Great concert',
  event_type: 'single',
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  is_featured: false,
  age_restriction: 0,
  is_virtual: false,
  is_hybrid: false,
  created_by: 'user-123',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01')
};

export const mockSchedule = {
  id: 'schedule-123',
  event_id: 'event-123',
  tenant_id: 'tenant-123',
  starts_at: new Date('2025-12-01T19:00:00Z'),
  ends_at: new Date('2025-12-01T23:00:00Z'),
  doors_open_at: new Date('2025-12-01T18:00:00Z'),
  timezone: 'America/New_York',
  status: 'SCHEDULED',
  is_recurring: false
};

export const mockCapacity = {
  id: 'capacity-123',
  tenant_id: 'tenant-123',
  event_id: 'event-123',
  section_name: 'General Admission',
  section_code: 'GA',
  total_capacity: 1000,
  available_capacity: 1000,
  reserved_capacity: 0,
  sold_count: 0,
  pending_count: 0,
  is_active: true,
  is_visible: true
};

export const mockPricing = {
  id: 'pricing-123',
  tenant_id: 'tenant-123',
  event_id: 'event-123',
  name: 'Standard',
  base_price: 50.00,
  service_fee: 5.00,
  facility_fee: 2.50,
  tax_rate: 0.08,
  current_price: 50.00,
  currency: 'USD',
  is_active: true,
  is_visible: true,
  is_dynamic: false
};

export const mockCategory = {
  id: 'category-123',
  name: 'Music',
  slug: 'music',
  description: 'Music events',
  is_active: true,
  is_featured: false,
  display_order: 0
};

export const mockMetadata = {
  id: 'metadata-123',
  tenant_id: 'tenant-123',
  event_id: 'event-123',
  performers: [],
  headliner: 'Test Artist',
  supporting_acts: [],
  technical_requirements: {},
  custom_fields: {}
};

// Legacy compatibility exports
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
