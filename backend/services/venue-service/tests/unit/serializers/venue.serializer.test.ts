/**
 * Venue Serializer Security Tests
 *
 * These tests verify that the venue serializer:
 * 1. Includes all safe fields
 * 2. Excludes all forbidden fields (data leakage prevention)
 * 3. Handles edge cases correctly
 */

import {
  serializeVenue,
  serializeVenues,
  serializeVenueSummary,
  findForbiddenVenueFields,
  findMissingSafeVenueFields,
  SAFE_VENUE_FIELDS,
  FORBIDDEN_VENUE_FIELDS,
} from '../../../src/serializers/venue.serializer';

describe('Venue Serializer', () => {
  // Mock venue with ALL fields (safe and forbidden)
  const mockVenueWithAllFields = {
    // Safe fields
    id: 'venue-123',
    tenant_id: 'tenant-456',
    name: 'Test Venue',
    slug: 'test-venue',
    description: 'A test venue',
    short_description: 'Test',
    address_line1: '123 Main St',
    address_line2: 'Suite 100',
    city: 'New York',
    state_province: 'NY',
    country_code: 'US',
    postal_code: '10001',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    max_capacity: 1000,
    status: 'active',
    is_verified: true,
    logo_url: 'https://example.com/logo.png',
    cover_image_url: 'https://example.com/cover.jpg',
    email: 'venue@example.com',
    phone: '+1234567890',
    website: 'https://example.com',
    social_links: { twitter: '@venue' },
    amenities: ['parking', 'wifi'],
    accessibility_features: ['wheelchair_ramp'],
    parking_info: 'Street parking available',
    public_transit_info: 'Subway nearby',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-15'),

    // FORBIDDEN fields - should NEVER appear in serialized output
    tax_id: '123-45-6789',
    business_registration: 'BR12345',
    stripe_connect_account_id: 'acct_stripe123',
    stripe_customer_id: 'cus_stripe456',
    stripe_account_status: 'active',
    payout_schedule: 'weekly',
    payout_method: 'bank_transfer',
    bank_account_last4: '1234',
    bank_routing_last4: '5678',
    total_revenue: 1000000,
    total_events: 50,
    total_tickets_sold: 5000,
    average_ticket_price: 75.5,
    commission_rate: 0.15,
    platform_fee_rate: 0.03,
    chargeback_rate: 0.02,
    chargeback_count: 5,
    created_by: 'admin-user-id',
    updated_by: 'admin-user-id',
    deleted_at: null,
    deleted_by: null,
    internal_notes: 'This is internal',
    admin_notes: 'Admin only',
    compliance_status: 'approved',
    compliance_notes: 'All good',
    verification_date: new Date('2024-01-10'),
    verification_notes: 'Verified by admin',
    last_audit_date: new Date('2024-01-12'),
    risk_score: 15,
    fraud_flags: ['none'],
    wallet_address: '0x1234567890abcdef',
    wallet_type: 'ethereum',
    blockchain_verified: true,
  };

  describe('serializeVenue', () => {
    it('should include all safe fields', () => {
      const result = serializeVenue(mockVenueWithAllFields);

      expect(result.id).toBe('venue-123');
      expect(result.tenantId).toBe('tenant-456');
      expect(result.name).toBe('Test Venue');
      expect(result.slug).toBe('test-venue');
      expect(result.description).toBe('A test venue');
      expect(result.city).toBe('New York');
      expect(result.stateProvince).toBe('NY');
      expect(result.countryCode).toBe('US');
      expect(result.maxCapacity).toBe(1000);
      expect(result.status).toBe('active');
      expect(result.isVerified).toBe(true);
      expect(result.email).toBe('venue@example.com');
      expect(result.website).toBe('https://example.com');
    });

    it('should EXCLUDE all forbidden fields', () => {
      const result = serializeVenue(mockVenueWithAllFields);
      const forbiddenFound = findForbiddenVenueFields(result);

      expect(forbiddenFound).toHaveLength(0);

      // Explicit checks for critical fields
      expect(result).not.toHaveProperty('taxId');
      expect(result).not.toHaveProperty('tax_id');
      expect(result).not.toHaveProperty('businessRegistration');
      expect(result).not.toHaveProperty('business_registration');
      expect(result).not.toHaveProperty('stripeConnectAccountId');
      expect(result).not.toHaveProperty('stripe_connect_account_id');
      expect(result).not.toHaveProperty('totalRevenue');
      expect(result).not.toHaveProperty('total_revenue');
      expect(result).not.toHaveProperty('commissionRate');
      expect(result).not.toHaveProperty('commission_rate');
      expect(result).not.toHaveProperty('walletAddress');
      expect(result).not.toHaveProperty('wallet_address');
      expect(result).not.toHaveProperty('internalNotes');
      expect(result).not.toHaveProperty('internal_notes');
      expect(result).not.toHaveProperty('createdBy');
      expect(result).not.toHaveProperty('created_by');
    });

    it('should throw error for null input', () => {
      expect(() => serializeVenue(null as any)).toThrow('Cannot serialize null or undefined venue');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeVenue(undefined as any)).toThrow('Cannot serialize null or undefined venue');
    });

    it('should handle missing optional fields with defaults', () => {
      const minimalVenue = {
        id: 'venue-minimal',
        tenant_id: 'tenant-1',
        name: 'Minimal Venue',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeVenue(minimalVenue);

      expect(result.id).toBe('venue-minimal');
      expect(result.status).toBe('draft'); // default value
      expect(result.isVerified).toBe(false); // default value
      expect(result.slug).toBeNull();
      expect(result.city).toBeNull();
    });
  });

  describe('serializeVenues', () => {
    it('should serialize array of venues', () => {
      const venues = [
        { ...mockVenueWithAllFields, id: 'venue-1', name: 'Venue 1' },
        { ...mockVenueWithAllFields, id: 'venue-2', name: 'Venue 2' },
      ];

      const result = serializeVenues(venues);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('venue-1');
      expect(result[1].id).toBe('venue-2');

      // Verify no forbidden fields in any venue
      result.forEach((venue) => {
        const forbiddenFound = findForbiddenVenueFields(venue);
        expect(forbiddenFound).toHaveLength(0);
      });
    });

    it('should handle empty array', () => {
      expect(serializeVenues([])).toEqual([]);
    });

    it('should handle null/undefined', () => {
      expect(serializeVenues(null as any)).toEqual([]);
      expect(serializeVenues(undefined as any)).toEqual([]);
    });
  });

  describe('serializeVenueSummary', () => {
    it('should return minimal safe fields', () => {
      const result = serializeVenueSummary(mockVenueWithAllFields);

      expect(result.id).toBe('venue-123');
      expect(result.name).toBe('Test Venue');
      expect(result.city).toBe('New York');
      expect(result.status).toBe('active');
      expect(result.isVerified).toBe(true);

      // Should not have detailed fields
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('website');

      // Should not have forbidden fields
      expect(result).not.toHaveProperty('tax_id');
      expect(result).not.toHaveProperty('stripe_connect_account_id');
    });
  });

  describe('findForbiddenVenueFields', () => {
    it('should detect forbidden fields in raw DB object', () => {
      const rawDbResult = {
        id: 'venue-1',
        name: 'Venue',
        tax_id: '123-45-6789', // FORBIDDEN
        stripe_connect_account_id: 'acct_123', // FORBIDDEN
      };

      const forbidden = findForbiddenVenueFields(rawDbResult);

      expect(forbidden).toContain('tax_id');
      expect(forbidden).toContain('stripe_connect_account_id');
      expect(forbidden).toHaveLength(2);
    });

    it('should return empty array for safe object', () => {
      const safeVenue = serializeVenue(mockVenueWithAllFields);
      const forbidden = findForbiddenVenueFields(safeVenue);

      expect(forbidden).toHaveLength(0);
    });
  });

  describe('findMissingSafeVenueFields', () => {
    it('should detect missing required fields', () => {
      const incompleteVenue = {
        id: 'venue-1',
        // missing: tenantId, name, status, isVerified
      };

      const missing = findMissingSafeVenueFields(incompleteVenue);

      expect(missing).toContain('tenantId');
      expect(missing).toContain('name');
      expect(missing).toContain('status');
      expect(missing).toContain('isVerified');
    });

    it('should return empty array when all required fields present', () => {
      const completeVenue = serializeVenue(mockVenueWithAllFields);
      const missing = findMissingSafeVenueFields(completeVenue);

      expect(missing).toHaveLength(0);
    });
  });

  describe('SAFE_VENUE_FIELDS constant', () => {
    it('should not contain any forbidden fields', () => {
      const forbiddenSet = new Set(FORBIDDEN_VENUE_FIELDS);

      SAFE_VENUE_FIELDS.forEach((field) => {
        expect(forbiddenSet.has(field as any)).toBe(false);
      });
    });

    it('should contain essential venue fields', () => {
      expect(SAFE_VENUE_FIELDS).toContain('id');
      expect(SAFE_VENUE_FIELDS).toContain('tenant_id');
      expect(SAFE_VENUE_FIELDS).toContain('name');
      expect(SAFE_VENUE_FIELDS).toContain('status');
      expect(SAFE_VENUE_FIELDS).toContain('is_verified');
    });

    it('should NOT contain sensitive fields', () => {
      expect(SAFE_VENUE_FIELDS).not.toContain('tax_id');
      expect(SAFE_VENUE_FIELDS).not.toContain('stripe_connect_account_id');
      expect(SAFE_VENUE_FIELDS).not.toContain('total_revenue');
      expect(SAFE_VENUE_FIELDS).not.toContain('wallet_address');
    });
  });
});
