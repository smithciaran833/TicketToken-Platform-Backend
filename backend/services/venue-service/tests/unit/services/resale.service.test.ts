/**
 * Unit tests for ResaleService
 * SECURITY TESTS: Jurisdiction detection, price caps, scalping detection, fraud detection
 */

import { ResaleService, createResaleService } from '../../../src/services/resale.service';
import { createKnexMock } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('ResaleService', () => {
  let service: ResaleService;
  let mockDb: ReturnType<typeof createKnexMock>;

  const mockTenantId = 'tenant-123e4567-e89b-12d3-a456-426614174000';
  const mockVenueId = 'venue-123e4567-e89b-12d3-a456-426614174001';
  const mockEventId = 'event-123e4567-e89b-12d3-a456-426614174002';
  const mockTicketId = 'ticket-123e4567-e89b-12d3-a456-426614174003';
  const mockSellerId = 'user-123e4567-e89b-12d3-a456-426614174004';
  const mockBuyerId = 'user-123e4567-e89b-12d3-a456-426614174005';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createKnexMock();
    service = createResaleService(mockDb);
  });

  describe('detectJurisdiction', () => {
    it('should return US state format for US addresses', () => {
      const result = service.detectJurisdiction('US', 'NY');
      expect(result).toBe('US-NY');
    });

    it('should return uppercase state code', () => {
      const result = service.detectJurisdiction('US', 'ca');
      expect(result).toBe('US-CA');
    });

    it('should return country code for non-US addresses', () => {
      const result = service.detectJurisdiction('UK');
      expect(result).toBe('UK');
    });

    it('should prioritize venue location over buyer location', () => {
      const result = service.detectJurisdiction('US', 'NY', 'US', 'CT');
      expect(result).toBe('US-CT');
    });

    it('should return DEFAULT when no location provided', () => {
      const result = service.detectJurisdiction('');
      expect(result).toBe('DEFAULT');
    });

    it('should handle undefined state for non-US countries', () => {
      const result = service.detectJurisdiction('FR', undefined);
      expect(result).toBe('FR');
    });
  });

  describe('getJurisdictionRule', () => {
    it('should return rule for US-CT (face value only)', () => {
      const rule = service.getJurisdictionRule('US-CT');
      expect(rule.maxMultiplier).toBe(1.0);
      expect(rule.notes).toContain('Connecticut');
    });

    it('should return rule for UK (face value + 10%)', () => {
      const rule = service.getJurisdictionRule('UK');
      expect(rule.maxMultiplier).toBe(1.1);
    });

    it('should return rule for France (face value only)', () => {
      const rule = service.getJurisdictionRule('FR');
      expect(rule.maxMultiplier).toBe(1.0);
    });

    it('should return DEFAULT rule for unknown jurisdiction', () => {
      const rule = service.getJurisdictionRule('UNKNOWN');
      expect(rule.maxMultiplier).toBeNull();
    });

    it('should return null maxMultiplier for US-NY (no cap)', () => {
      const rule = service.getJurisdictionRule('US-NY');
      expect(rule.maxMultiplier).toBeNull();
    });
  });

  describe('getResalePolicy', () => {
    it('should return event-specific policy when available', async () => {
      mockDb._mockChain.first.mockResolvedValueOnce({
        resale_allowed: true,
        max_price_multiplier: 1.5,
        max_transfers: 2,
        seller_verification_required: true,
      });

      const policy = await service.getResalePolicy(mockVenueId, mockEventId, mockTenantId, 'US-NY');

      expect(policy.resaleAllowed).toBe(true);
      expect(policy.maxPriceMultiplier).toBe(1.5);
      expect(policy.maxTransfers).toBe(2);
      expect(policy.sellerVerificationRequired).toBe(true);
    });

    it('should fallback to venue default policy when no event policy', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // No event-specific policy
        .mockResolvedValueOnce({
          resale_allowed: true,
          max_price_multiplier: 2.0,
          max_transfers: 3,
        });

      const policy = await service.getResalePolicy(mockVenueId, mockEventId, mockTenantId, 'US-NY');

      expect(policy.maxPriceMultiplier).toBe(2.0);
      expect(policy.maxTransfers).toBe(3);
    });

    it('should fallback to venue_settings when no policies exist', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce(null) // No event policy
        .mockResolvedValueOnce(null) // No venue policy
        .mockResolvedValueOnce({
          ticket_resale_allowed: true,
          max_resale_price_multiplier: 1.2,
          max_transfers_per_ticket: 1,
          require_seller_verification: false,
        });

      const policy = await service.getResalePolicy(mockVenueId, mockEventId, mockTenantId, 'US-NY');

      expect(policy.resaleAllowed).toBe(true);
      expect(policy.maxPriceMultiplier).toBe(1.2);
      expect(policy.maxTransfers).toBe(1);
    });

    it('should apply jurisdiction rule when stricter than policy', async () => {
      mockDb._mockChain.first.mockResolvedValueOnce({
        resale_allowed: true,
        max_price_multiplier: 2.0, // Policy allows 2x
      });

      const policy = await service.getResalePolicy(mockVenueId, mockEventId, mockTenantId, 'US-CT');

      // US-CT has 1.0 max multiplier which is stricter
      expect(policy.jurisdictionRule).not.toBeNull();
      expect(policy.jurisdictionRule?.maxMultiplier).toBe(1.0);
    });

    it('should return default values when no policies found', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const policy = await service.getResalePolicy(mockVenueId, mockEventId, mockTenantId, 'DEFAULT');

      expect(policy.resaleAllowed).toBe(true);
      expect(policy.maxPriceMultiplier).toBeNull();
    });
  });

  describe('validatePrice', () => {
    const faceValue = 100;

    it('should allow any price when no restrictions', async () => {
      const policy = {
        resaleAllowed: true,
        maxPriceMultiplier: null,
        maxPriceFixed: null,
        maxTransfers: null,
        sellerVerificationRequired: false,
        resaleCutoffHours: null,
        listingCutoffHours: null,
        jurisdictionRule: null,
        antiScalpingEnabled: false,
      };

      const result = await service.validatePrice(200, faceValue, policy, 'DEFAULT');

      expect(result.valid).toBe(true);
      expect(result.appliedRule).toBe('none');
    });

    it('should reject price above multiplier cap', async () => {
      const policy = {
        resaleAllowed: true,
        maxPriceMultiplier: 1.5,
        maxPriceFixed: null,
        maxTransfers: null,
        sellerVerificationRequired: false,
        resaleCutoffHours: null,
        listingCutoffHours: null,
        jurisdictionRule: null,
        antiScalpingEnabled: false,
      };

      const result = await service.validatePrice(200, faceValue, policy, 'DEFAULT');

      expect(result.valid).toBe(false);
      expect(result.maxAllowedPrice).toBe(150);
      expect(result.appliedRule).toBe('multiplier');
    });

    it('should accept price at multiplier cap', async () => {
      const policy = {
        resaleAllowed: true,
        maxPriceMultiplier: 1.5,
        maxPriceFixed: null,
        maxTransfers: null,
        sellerVerificationRequired: false,
        resaleCutoffHours: null,
        listingCutoffHours: null,
        jurisdictionRule: null,
        antiScalpingEnabled: false,
      };

      const result = await service.validatePrice(150, faceValue, policy, 'DEFAULT');

      expect(result.valid).toBe(true);
    });

    it('should apply fixed cap when stricter than multiplier', async () => {
      const policy = {
        resaleAllowed: true,
        maxPriceMultiplier: 2.0, // Would allow $200
        maxPriceFixed: 120, // But cap at $120
        maxTransfers: null,
        sellerVerificationRequired: false,
        resaleCutoffHours: null,
        listingCutoffHours: null,
        jurisdictionRule: null,
        antiScalpingEnabled: false,
      };

      const result = await service.validatePrice(150, faceValue, policy, 'DEFAULT');

      expect(result.valid).toBe(false);
      expect(result.maxAllowedPrice).toBe(120);
      expect(result.appliedRule).toBe('fixed');
    });

    it('should apply jurisdiction rule when stricter', async () => {
      const policy = {
        resaleAllowed: true,
        maxPriceMultiplier: 2.0,
        maxPriceFixed: null,
        maxTransfers: null,
        sellerVerificationRequired: false,
        resaleCutoffHours: null,
        listingCutoffHours: null,
        jurisdictionRule: null,
        antiScalpingEnabled: false,
      };

      // US-CT has 1.0 multiplier
      const result = await service.validatePrice(150, faceValue, policy, 'US-CT');

      expect(result.valid).toBe(false);
      expect(result.maxAllowedPrice).toBe(100);
      expect(result.appliedRule).toBe('jurisdiction');
    });
  });

  describe('getTransferCount', () => {
    it('should return correct transfer count', async () => {
      mockDb._mockChain.first.mockResolvedValue({ count: '3' });

      const count = await service.getTransferCount(mockTicketId, mockTenantId);

      expect(count).toBe(3);
    });

    it('should return 0 when no transfers', async () => {
      mockDb._mockChain.first.mockResolvedValue({ count: '0' });

      const count = await service.getTransferCount(mockTicketId, mockTenantId);

      expect(count).toBe(0);
    });
  });

  describe('validateTransfer', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    beforeEach(() => {
      // Default mocks for successful validation
      mockDb._mockChain.first
        .mockResolvedValueOnce({ resale_allowed: true, max_transfers: 5 }) // policy
        .mockResolvedValueOnce({ count: '1' }) // transfer count
        .mockResolvedValueOnce({ verified: true }); // seller verification
    });

    it('should reject when resale not allowed', async () => {
      mockDb._mockChain.first.mockReset();
      mockDb._mockChain.first.mockResolvedValueOnce({ resale_allowed: false });

      const result = await service.validateTransfer(
        mockTicketId,
        mockEventId,
        mockVenueId,
        mockTenantId,
        mockSellerId,
        100,
        100,
        futureDate,
        'US-NY'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('should reject when transfer limit reached', async () => {
      mockDb._mockChain.first.mockReset();
      mockDb._mockChain.first
        .mockResolvedValueOnce({ resale_allowed: true, max_transfers: 2 })
        .mockResolvedValueOnce({ count: '2' }); // Already at limit

      const result = await service.validateTransfer(
        mockTicketId,
        mockEventId,
        mockVenueId,
        mockTenantId,
        mockSellerId,
        100,
        100,
        futureDate,
        'US-NY'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum transfer limit');
    });

    it('should reject when cutoff time passed', async () => {
      mockDb._mockChain.first.mockReset();
      mockDb._mockChain.first
        .mockResolvedValueOnce({ resale_allowed: true, resale_cutoff_hours: 48 })
        .mockResolvedValueOnce({ count: '0' });

      const eventStartTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const result = await service.validateTransfer(
        mockTicketId,
        mockEventId,
        mockVenueId,
        mockTenantId,
        mockSellerId,
        100,
        100,
        eventStartTime, // 24h away but 48h cutoff
        'US-NY'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('window closed');
    });

    it('should reject when seller verification required but not verified', async () => {
      mockDb._mockChain.first.mockReset();
      mockDb._mockChain.first
        .mockResolvedValueOnce({ resale_allowed: true, seller_verification_required: true })
        .mockResolvedValueOnce({ count: '0' })
        .mockResolvedValueOnce(null); // Not verified

      const result = await service.validateTransfer(
        mockTicketId,
        mockEventId,
        mockVenueId,
        mockTenantId,
        mockSellerId,
        100,
        100,
        futureDate,
        'US-NY'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('verification required');
      expect(result.requiresVerification).toBe(true);
    });

    it('should reject when price exceeds cap', async () => {
      mockDb._mockChain.first.mockReset();
      mockDb._mockChain.first
        .mockResolvedValueOnce({ resale_allowed: true, max_price_multiplier: 1.0 })
        .mockResolvedValueOnce({ count: '0' });

      const result = await service.validateTransfer(
        mockTicketId,
        mockEventId,
        mockVenueId,
        mockTenantId,
        mockSellerId,
        150, // Requesting 150
        100, // Face value 100
        futureDate,
        'US-NY'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
      expect(result.maxAllowedPrice).toBe(100);
    });
  });

  describe('isSellerVerified', () => {
    it('should return true when verified', async () => {
      mockDb._mockChain.first.mockResolvedValue({ verified: true });

      const result = await service.isSellerVerified(mockSellerId, mockVenueId, mockTenantId);

      expect(result).toBe(true);
    });

    it('should return false when not verified', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await service.isSellerVerified(mockSellerId, mockVenueId, mockTenantId);

      expect(result).toBe(false);
    });
  });

  describe('recordTransfer', () => {
    it('should record transfer with correct data', async () => {
      mockDb._mockChain.first.mockResolvedValue({ count: '2' }); // Previous transfers
      mockDb._mockChain.returning.mockResolvedValue([{ id: 'transfer-123' }]);

      const result = await service.recordTransfer(
        mockTicketId,
        mockEventId,
        mockVenueId,
        mockTenantId,
        mockSellerId,
        mockBuyerId,
        'resale',
        150,
        100,
        'US-NY',
        true,
        'identity'
      );

      expect(result).toBe('transfer-123');
      expect(mockDb).toHaveBeenCalledWith('transfer_history');
    });
  });

  describe('detectScalpingBehavior', () => {
    it('should return low risk for normal user', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ count: '2' }) // ticket count
        .mockResolvedValueOnce({ count: '3' }) // resale count
        .mockResolvedValueOnce({ avg_markup: '10' }) // avg markup
        .mockResolvedValueOnce({ count: '0' }); // quick flips

      const result = await service.detectScalpingBehavior(mockSellerId, mockTenantId, mockEventId);

      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBeLessThan(20);
      expect(result.isBlocked).toBe(false);
    });

    it('should flag high volume purchases', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ count: '15' }) // High ticket count
        .mockResolvedValueOnce({ count: '5' })
        .mockResolvedValueOnce({ avg_markup: '10' })
        .mockResolvedValueOnce({ count: '0' });

      const result = await service.detectScalpingBehavior(mockSellerId, mockTenantId, mockEventId);

      expect(result.flags).toContainEqual(expect.stringContaining('High volume'));
      expect(result.riskScore).toBeGreaterThanOrEqual(30);
    });

    it('should flag high resale activity', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ count: '2' })
        .mockResolvedValueOnce({ count: '55' }) // Very high resale
        .mockResolvedValueOnce({ avg_markup: '10' })
        .mockResolvedValueOnce({ count: '0' });

      const result = await service.detectScalpingBehavior(mockSellerId, mockTenantId, mockEventId);

      expect(result.flags).toContainEqual(expect.stringContaining('resale activity'));
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('should flag excessive markup', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ count: '2' })
        .mockResolvedValueOnce({ count: '5' })
        .mockResolvedValueOnce({ avg_markup: '150' }) // 150% markup
        .mockResolvedValueOnce({ count: '0' });

      const result = await service.detectScalpingBehavior(mockSellerId, mockTenantId, mockEventId);

      expect(result.flags).toContainEqual(expect.stringContaining('markup'));
    });

    it('should return critical risk for combined signals', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ count: '15' }) // High volume
        .mockResolvedValueOnce({ count: '55' }) // High resale
        .mockResolvedValueOnce({ avg_markup: '150' }) // High markup
        .mockResolvedValueOnce({ count: '15' }); // Many quick flips

      const result = await service.detectScalpingBehavior(mockSellerId, mockTenantId, mockEventId);

      expect(result.riskLevel).toBe('critical');
      expect(result.requiresReview).toBe(true);
    });
  });

  describe('isUserBlockedFromResale', () => {
    it('should return blocked=true when user is blocked', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        active: true,
        reason: 'Scalping detected',
      });

      const result = await service.isUserBlockedFromResale(mockSellerId, mockTenantId);

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Scalping detected');
    });

    it('should return blocked=false when not blocked', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await service.isUserBlockedFromResale(mockSellerId, mockTenantId);

      expect(result.blocked).toBe(false);
    });
  });

  describe('blockUserFromResale', () => {
    it('should create block record', async () => {
      mockDb._mockChain.insert.mockResolvedValue([1]);

      await service.blockUserFromResale(
        mockSellerId,
        mockTenantId,
        'Scalping behavior detected',
        'admin-123'
      );

      expect(mockDb).toHaveBeenCalledWith('resale_blocks');
      expect(mockDb._mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockSellerId,
          tenant_id: mockTenantId,
          reason: 'Scalping behavior detected',
          blocked_by: 'admin-123',
          active: true,
        })
      );
    });
  });

  describe('detectFraudSignals', () => {
    it('should detect same device fraud signal', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ device_fingerprint: 'same-device' }) // Seller device
        .mockResolvedValueOnce({ face_value: 100 }) // Ticket
        .mockResolvedValueOnce({ created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }) // Old account
        .mockResolvedValueOnce({ count: '0' }) // Velocity
        .mockResolvedValueOnce(null) // No suspicious IP
        .mockResolvedValueOnce(null); // No fraud pattern

      const result = await service.detectFraudSignals(
        mockTicketId,
        mockSellerId,
        mockBuyerId,
        100,
        mockTenantId,
        '1.2.3.4',
        'same-device'
      );

      expect(result.signals).toContainEqual(
        expect.objectContaining({
          type: 'same_device',
          severity: 'high',
        })
      );
      expect(result.riskScore).toBeGreaterThanOrEqual(50);
    });

    it('should detect suspicious pricing (below face value)', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ face_value: 100 }) // Ticket face value
        .mockResolvedValueOnce({ created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }) // Old account
        .mockResolvedValueOnce({ count: '0' }) // Velocity
        .mockResolvedValueOnce(null); // No fraud pattern

      const result = await service.detectFraudSignals(
        mockTicketId,
        mockSellerId,
        mockBuyerId,
        40, // 40% of face value
        mockTenantId
      );

      expect(result.signals).toContainEqual(
        expect.objectContaining({
          type: 'suspicious_pricing',
        })
      );
    });

    it('should detect new account fraud signal', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ face_value: 100 }) // Ticket
        .mockResolvedValueOnce({ created_at: new Date() }) // Brand new account
        .mockResolvedValueOnce({ count: '0' }) // Velocity
        .mockResolvedValueOnce(null); // No fraud pattern

      const result = await service.detectFraudSignals(
        mockTicketId,
        mockSellerId,
        mockBuyerId,
        100,
        mockTenantId
      );

      expect(result.signals).toContainEqual(
        expect.objectContaining({
          type: 'new_account',
        })
      );
    });

    it('should detect high velocity fraud signal', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ face_value: 100 }) // Ticket
        .mockResolvedValueOnce({ created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }) // Old account
        .mockResolvedValueOnce({ count: '15' }) // 15 sales in last hour
        .mockResolvedValueOnce(null); // No fraud pattern

      const result = await service.detectFraudSignals(
        mockTicketId,
        mockSellerId,
        mockBuyerId,
        100,
        mockTenantId
      );

      expect(result.signals).toContainEqual(
        expect.objectContaining({
          type: 'velocity',
          severity: 'high',
        })
      );
    });

    it('should return block action for high risk score', async () => {
      mockDb._mockChain.first
        .mockResolvedValueOnce({ device_fingerprint: 'same-device' }) // Same device = 50
        .mockResolvedValueOnce({ face_value: 100 })
        .mockResolvedValueOnce({ created_at: new Date() }) // New account = 25
        .mockResolvedValueOnce({ count: '15' }) // High velocity = 30
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.detectFraudSignals(
        mockTicketId,
        mockSellerId,
        mockBuyerId,
        100,
        mockTenantId,
        undefined,
        'same-device'
      );

      expect(result.action).toBe('block');
      expect(result.blocked).toBe(true);
    });
  });

  describe('createResaleService factory', () => {
    it('should create ResaleService instance', () => {
      const db = createKnexMock();
      const instance = createResaleService(db);
      expect(instance).toBeInstanceOf(ResaleService);
    });
  });
});
