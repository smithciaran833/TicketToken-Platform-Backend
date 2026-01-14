/**
 * Unit Tests for Event Handlers
 * Tests marketplace event handler implementations
 */

import { EventHandlers, eventHandlers } from '../../../src/events/handlers';
import { MarketplaceEvents, MarketplaceEvent } from '../../../src/events/event-types';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('EventHandlers', () => {
  let handlers: EventHandlers;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = new EventHandlers();
  });

  describe('handleTicketMinted', () => {
    it('should log the event', async () => {
      const { logger } = require('../../../src/utils/logger');
      const event: MarketplaceEvent = {
        type: MarketplaceEvents.LISTING_CREATED,
        timestamp: new Date(),
        payload: { ticketId: 'ticket-123', eventId: 'event-456' },
      };

      await handlers.handleTicketMinted(event);

      expect(logger.info).toHaveBeenCalledWith('Handling ticket minted event', event);
    });

    it('should handle errors gracefully', async () => {
      const { logger } = require('../../../src/utils/logger');
      logger.info.mockImplementation(() => {
        throw new Error('Log failed');
      });

      const event: MarketplaceEvent = {
        type: MarketplaceEvents.LISTING_CREATED,
        timestamp: new Date(),
        payload: { ticketId: 'ticket-123' },
      };

      // Should not throw
      await expect(handlers.handleTicketMinted(event)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handlePaymentCompleted', () => {
    it('should log the payment event', async () => {
      const { logger } = require('../../../src/utils/logger');
      const event: MarketplaceEvent = {
        type: MarketplaceEvents.TRANSFER_COMPLETED,
        timestamp: new Date(),
        payload: {
          paymentId: 'payment-123',
          transferId: 'transfer-456',
          amount: 10000,
        },
      };

      await handlers.handlePaymentCompleted(event);

      expect(logger.info).toHaveBeenCalledWith('Handling payment completed event', event);
    });

    it('should handle errors gracefully', async () => {
      const { logger } = require('../../../src/utils/logger');
      logger.info.mockImplementation(() => {
        throw new Error('Payment handler error');
      });

      const event: MarketplaceEvent = {
        type: MarketplaceEvents.TRANSFER_COMPLETED,
        timestamp: new Date(),
        payload: { paymentId: 'payment-123' },
      };

      await expect(handlers.handlePaymentCompleted(event)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handleUserBanned', () => {
    it('should log user banned event', async () => {
      const { logger } = require('../../../src/utils/logger');
      const event: MarketplaceEvent = {
        type: MarketplaceEvents.LISTING_CANCELLED,
        timestamp: new Date(),
        payload: {
          userId: 'user-123',
          reason: 'fraudulent activity',
        },
      };

      await handlers.handleUserBanned(event);

      expect(logger.info).toHaveBeenCalledWith('Handling user banned event', event);
    });

    it('should handle errors gracefully', async () => {
      const { logger } = require('../../../src/utils/logger');
      logger.info.mockImplementation(() => {
        throw new Error('User ban handler error');
      });

      const event: MarketplaceEvent = {
        type: MarketplaceEvents.LISTING_CANCELLED,
        timestamp: new Date(),
        payload: { userId: 'user-123' },
      };

      await expect(handlers.handleUserBanned(event)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

describe('eventHandlers singleton', () => {
  it('should be an instance of EventHandlers', () => {
    expect(eventHandlers).toBeInstanceOf(EventHandlers);
  });

  it('should have all handler methods', () => {
    expect(typeof eventHandlers.handleTicketMinted).toBe('function');
    expect(typeof eventHandlers.handlePaymentCompleted).toBe('function');
    expect(typeof eventHandlers.handleUserBanned).toBe('function');
  });
});
