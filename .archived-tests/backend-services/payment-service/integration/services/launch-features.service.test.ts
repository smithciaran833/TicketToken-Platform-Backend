/**
 * Launch Features Integration Tests
 */

import {
  IPGeolocationService,
  DeviceFingerprintService,
  BlacklistService,
  VenueSubscriptionService,
  CurrencyService,
  InstantPayoutService,
} from '../../../src/services/launch-features';

describe('Launch Features', () => {
  describe('IPGeolocationService', () => {
    let service: IPGeolocationService;

    beforeEach(() => {
      service = new IPGeolocationService();
    });

    it('should return location for known IP', async () => {
      const location = await service.getLocation('0.0.0.0');
      expect(location.country).toBe('US');
      expect(location.city).toBe('Nashville');
    });

    it('should return mock data for unknown IP', async () => {
      const location = await service.getLocation('8.8.8.8');
      expect(location.country).toBe('US');
      expect(location.mockData).toBe(true);
    });

    it('should identify high risk countries', () => {
      expect(service.isHighRiskCountry('XX')).toBe(true);
      expect(service.isHighRiskCountry('US')).toBe(false);
    });
  });

  describe('DeviceFingerprintService', () => {
    let service: DeviceFingerprintService;

    beforeEach(() => {
      service = new DeviceFingerprintService();
    });

    it('should generate fingerprint from device data', () => {
      const fingerprint = service.generateFingerprint({
        userAgent: 'Mozilla/5.0',
        screenResolution: '1920x1080',
        timezone: 'America/New_York',
      });

      expect(fingerprint).toBeDefined();
      expect(fingerprint.length).toBe(16);
    });

    it('should generate consistent fingerprints', () => {
      const data = { userAgent: 'test', screenResolution: '1080p', timezone: 'UTC' };
      const fp1 = service.generateFingerprint(data);
      const fp2 = service.generateFingerprint(data);

      expect(fp1).toBe(fp2);
    });

    it('should check device trust', async () => {
      const result = await service.checkDevice('fingerprint123');
      expect(result.trusted).toBe(true);
      expect(result.mockData).toBe(true);
    });
  });

  describe('BlacklistService', () => {
    let service: BlacklistService;

    beforeEach(() => {
      service = new BlacklistService();
    });

    it('should return not blocked for clean data', async () => {
      const result = await service.checkBlacklists({
        userId: 'user123',
        email: 'test@example.com',
        ip: '1.2.3.4',
      });

      expect(result.blocked).toBe(false);
    });

    it('should block blacklisted user', async () => {
      service.addToBlacklist('user', 'bad-user');
      const result = await service.checkBlacklists({ userId: 'bad-user' });

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('User blacklisted');
    });

    it('should block blacklisted email', async () => {
      service.addToBlacklist('email', 'spam@bad.com');
      const result = await service.checkBlacklists({ email: 'spam@bad.com' });

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Email blacklisted');
    });

    it('should block blacklisted IP', async () => {
      service.addToBlacklist('ip', '10.0.0.1');
      const result = await service.checkBlacklists({ ip: '10.0.0.1' });

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('IP blacklisted');
    });
  });

  describe('VenueSubscriptionService', () => {
    let service: VenueSubscriptionService;

    beforeEach(() => {
      service = new VenueSubscriptionService();
    });

    it('should return all plans', () => {
      const plans = service.getPlans();

      expect(plans.length).toBe(3);
      expect(plans.map(p => p.id)).toContain('starter');
      expect(plans.map(p => p.id)).toContain('pro');
      expect(plans.map(p => p.id)).toContain('enterprise');
    });

    it('should subscribe venue to plan', async () => {
      const result = await service.subscribeVenue('venue123', 'pro');

      expect(result.subscriptionId).toBeDefined();
      expect(result.venueId).toBe('venue123');
      expect(result.plan.id).toBe('pro');
      expect(result.status).toBe('active');
    });

    it('should throw for invalid plan', async () => {
      await expect(service.subscribeVenue('venue123', 'invalid'))
        .rejects.toThrow('Invalid plan');
    });

    it('should return fee percentage for plan', () => {
      expect(service.getFeePercentage('starter')).toBe(8.2);
      expect(service.getFeePercentage('pro')).toBe(7.9);
      expect(service.getFeePercentage('enterprise')).toBe(7.5);
      expect(service.getFeePercentage('invalid')).toBe(8.2); // default
    });
  });

  describe('CurrencyService', () => {
    let service: CurrencyService;

    beforeEach(() => {
      service = new CurrencyService();
    });

    it('should convert USD to EUR', async () => {
      const result = await service.convert(100, 'USD', 'EUR');
      expect(result).toBe(85); // 100 * 0.85
    });

    it('should convert EUR to USD', async () => {
      const result = await service.convert(85, 'EUR', 'USD');
      expect(result).toBe(100);
    });

    it('should handle same currency conversion', async () => {
      const result = await service.convert(100, 'USD', 'USD');
      expect(result).toBe(100);
    });

    it('should throw for unsupported currency', async () => {
      await expect(service.convert(100, 'USD', 'XYZ'))
        .rejects.toThrow('Unsupported currency');
    });

    it('should return supported currencies', () => {
      const currencies = service.getSupportedCurrencies();
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
      expect(currencies).toContain('CAD');
    });

    it('should format for display', async () => {
      const result = await service.convertForDisplay(100, 'USD', 'EUR');
      expect(result).toBe('85.00');
    });

    it('should get exchange rate', () => {
      const rate = service.getExchangeRate('USD', 'EUR');
      expect(rate).toBe(0.85);
    });
  });

  describe('InstantPayoutService', () => {
    let service: InstantPayoutService;

    beforeEach(() => {
      service = new InstantPayoutService();
    });

    it('should create standard payout', async () => {
      const result = await service.requestPayout('venue123', 1000, false);

      expect(result.payoutId).toBeDefined();
      expect(result.venueId).toBe('venue123');
      expect(result.amount).toBe(1000);
      expect(result.fee).toBe(0);
      expect(result.type).toBe('standard');
      expect(result.estimatedArrival).toBe('1-2 business days');
    });

    it('should create instant payout with fee', async () => {
      const result = await service.requestPayout('venue123', 1000, true);

      expect(result.amount).toBe(990); // 1000 - 1%
      expect(result.fee).toBe(10); // 1%
      expect(result.type).toBe('instant');
      expect(result.estimatedArrival).toBe('Within 30 minutes');
    });

    it('should calculate fee correctly for instant payout', async () => {
      const result = await service.requestPayout('venue123', 500, true);

      expect(result.fee).toBe(5); // 1% of 500
      expect(result.amount).toBe(495);
    });
  });
});
