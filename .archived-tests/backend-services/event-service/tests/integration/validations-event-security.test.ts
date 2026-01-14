/**
 * EventSecurityValidator Integration Tests
 */

import { EventSecurityValidator } from '../../src/validations/event-security';

describe('EventSecurityValidator', () => {
  let validator: EventSecurityValidator;

  beforeEach(() => {
    validator = new EventSecurityValidator();
  });

  describe('validateTicketPurchase', () => {
    it('should pass for valid quantity', async () => {
      await expect(validator.validateTicketPurchase('cust1', 'evt1', 5, 0))
        .resolves.toBeUndefined();
    });

    it('should throw when exceeding maxTicketsPerOrder (10)', async () => {
      await expect(validator.validateTicketPurchase('cust1', 'evt1', 15, 0))
        .rejects.toThrow('10 tickets per order');
    });

    it('should throw when exceeding maxTicketsPerCustomer (50)', async () => {
      await expect(validator.validateTicketPurchase('cust1', 'evt1', 5, 48))
        .rejects.toThrow('50 tickets per event');
    });

    it('should pass at exactly maxTicketsPerOrder', async () => {
      await expect(validator.validateTicketPurchase('cust1', 'evt1', 10, 0))
        .resolves.toBeUndefined();
    });

    it('should pass at exactly maxTicketsPerCustomer', async () => {
      await expect(validator.validateTicketPurchase('cust1', 'evt1', 5, 45))
        .resolves.toBeUndefined();
    });
  });

  describe('validateEventDate', () => {
    it('should pass for valid future date', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      await expect(validator.validateEventDate(future)).resolves.toBeUndefined();
    });

    it('should throw for date too soon (< 2 hours)', async () => {
      const soon = new Date();
      soon.setMinutes(soon.getMinutes() + 30);
      await expect(validator.validateEventDate(soon)).rejects.toThrow('2 hours in advance');
    });

    it('should throw for date too far (> 365 days)', async () => {
      const far = new Date();
      far.setDate(far.getDate() + 400);
      await expect(validator.validateEventDate(far)).rejects.toThrow('365 days in advance');
    });

    it('should pass at exactly 2 hours', async () => {
      const exact = new Date();
      exact.setHours(exact.getHours() + 2, exact.getMinutes() + 1);
      await expect(validator.validateEventDate(exact)).resolves.toBeUndefined();
    });
  });

  describe('validateEventModification', () => {
    it('should throw for missing eventId', async () => {
      await expect(validator.validateEventModification('', {}))
        .rejects.toThrow('Event ID is required');
    });

    it('should validate date if provided', async () => {
      const soon = new Date();
      soon.setMinutes(soon.getMinutes() + 30);
      await expect(validator.validateEventModification('evt1', { date: soon.toISOString() }))
        .rejects.toThrow('2 hours in advance');
    });

    it('should pass with valid eventId and no date', async () => {
      await expect(validator.validateEventModification('evt1', { name: 'Updated' }))
        .resolves.toBeUndefined();
    });
  });

  describe('validateEventDeletion', () => {
    it('should throw for missing eventId', async () => {
      await expect(validator.validateEventDeletion(''))
        .rejects.toThrow('Event ID is required');
    });

    it('should pass with valid eventId', async () => {
      await expect(validator.validateEventDeletion('evt1'))
        .resolves.toBeUndefined();
    });
  });

  describe('validateVenueCapacity', () => {
    it('should pass when requested <= venue capacity', async () => {
      await expect(validator.validateVenueCapacity(500, 1000))
        .resolves.toBeUndefined();
    });

    it('should throw when requested > venue capacity', async () => {
      await expect(validator.validateVenueCapacity(1500, 1000))
        .rejects.toThrow('cannot exceed venue capacity');
    });

    it('should pass at exactly venue capacity', async () => {
      await expect(validator.validateVenueCapacity(1000, 1000))
        .resolves.toBeUndefined();
    });
  });
});
