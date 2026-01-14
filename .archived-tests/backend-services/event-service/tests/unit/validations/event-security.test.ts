import { EventSecurityValidator } from '../../../src/validations/event-security';

describe('EventSecurityValidator', () => {
  let validator: EventSecurityValidator;

  beforeEach(() => {
    validator = new EventSecurityValidator();
  });

  describe('validateTicketPurchase', () => {
    it('should allow valid ticket purchase', async () => {
      await expect(
        validator.validateTicketPurchase('customer-1', 'event-1', 5, 10)
      ).resolves.not.toThrow();
    });

    it('should reject purchase exceeding max tickets per order', async () => {
      await expect(
        validator.validateTicketPurchase('customer-1', 'event-1', 11, 0)
      ).rejects.toThrow('Cannot purchase more than 10 tickets per order');
    });

    it('should reject purchase exceeding max tickets per customer', async () => {
      await expect(
        validator.validateTicketPurchase('customer-1', 'event-1', 10, 45)
      ).rejects.toThrow('Cannot purchase more than 50 tickets per event');
    });

    it('should reject when existing + new tickets exceed limit', async () => {
      await expect(
        validator.validateTicketPurchase('customer-1', 'event-1', 6, 45)
      ).rejects.toThrow('Cannot purchase more than 50 tickets per event');
    });
  });

  describe('validateEventDate', () => {
    it('should allow valid future date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await expect(
        validator.validateEventDate(futureDate)
      ).resolves.not.toThrow();
    });

    it('should reject date too soon', async () => {
      const tooSoon = new Date();
      tooSoon.setHours(tooSoon.getHours() + 1); // Only 1 hour in advance

      await expect(
        validator.validateEventDate(tooSoon)
      ).rejects.toThrow('Event must be scheduled at least 2 hours in advance');
    });

    it('should reject date too far in future', async () => {
      const tooFar = new Date();
      tooFar.setDate(tooFar.getDate() + 400); // More than 365 days

      await expect(
        validator.validateEventDate(tooFar)
      ).rejects.toThrow('Event cannot be scheduled more than 365 days in advance');
    });

    it('should accept date exactly at minimum advance', async () => {
      const exactMin = new Date();
      exactMin.setHours(exactMin.getHours() + 2); // Exactly 2 hours

      await expect(
        validator.validateEventDate(exactMin)
      ).resolves.not.toThrow();
    });
  });

  describe('validateEventModification', () => {
    it('should allow valid modification', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await expect(
        validator.validateEventModification('event-1', { 
          name: 'Updated Event',
          date: futureDate.toISOString()
        })
      ).resolves.not.toThrow();
    });

    it('should reject modification without event ID', async () => {
      await expect(
        validator.validateEventModification('', { name: 'Test' })
      ).rejects.toThrow('Event ID is required for modification');
    });

    it('should validate date if provided', async () => {
      const tooSoon = new Date();
      tooSoon.setHours(tooSoon.getHours() + 1);

      await expect(
        validator.validateEventModification('event-1', { 
          date: tooSoon.toISOString()
        })
      ).rejects.toThrow('Event must be scheduled at least 2 hours in advance');
    });

    it('should allow modification without date', async () => {
      await expect(
        validator.validateEventModification('event-1', { 
          name: 'Updated Event'
        })
      ).resolves.not.toThrow();
    });
  });

  describe('validateEventDeletion', () => {
    it('should allow deletion with valid event ID', async () => {
      await expect(
        validator.validateEventDeletion('event-1')
      ).resolves.not.toThrow();
    });

    it('should reject deletion without event ID', async () => {
      await expect(
        validator.validateEventDeletion('')
      ).rejects.toThrow('Event ID is required for deletion');
    });
  });

  describe('validateVenueCapacity', () => {
    it('should allow capacity within venue limits', async () => {
      await expect(
        validator.validateVenueCapacity(500, 1000)
      ).resolves.not.toThrow();
    });

    it('should allow capacity equal to venue capacity', async () => {
      await expect(
        validator.validateVenueCapacity(1000, 1000)
      ).resolves.not.toThrow();
    });

    it('should reject capacity exceeding venue capacity', async () => {
      await expect(
        validator.validateVenueCapacity(1500, 1000)
      ).rejects.toThrow('Event capacity (1500) cannot exceed venue capacity (1000)');
    });
  });
});
