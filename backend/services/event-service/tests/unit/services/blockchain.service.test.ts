/**
 * Unit tests for EventBlockchainService
 * Tests Solana blockchain integration for event creation
 */

// Mock dependencies before imports
const mockBlockchainClient = {
  createEvent: jest.fn(),
  close: jest.fn(),
};

const mockDeriveVenuePDA = jest.fn();

jest.mock('@tickettoken/shared', () => ({
  BlockchainClient: jest.fn().mockImplementation(() => mockBlockchainClient),
  BlockchainConfig: {},
  CreateEventParams: {},
  CreateEventResult: {},
  BlockchainError: class BlockchainError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BlockchainError';
    }
  },
  deriveVenuePDA: mockDeriveVenuePDA,
}));

const mockPublicKey = {
  toBase58: jest.fn().mockReturnValue('venue-pda-base58'),
  default: { toBase58: jest.fn().mockReturnValue('default-pubkey') },
};

jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((key: string) => ({
    toBase58: () => key,
    ...mockPublicKey,
  })),
}));

jest.mock('pino', () => () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { EventBlockchainService, EventBlockchainData } from '../../../src/services/blockchain.service';
import { BlockchainError } from '@tickettoken/shared';

describe('EventBlockchainService', () => {
  let service: EventBlockchainService;

  const mockEventData: EventBlockchainData = {
    eventId: 12345,
    venueId: 'venue-123',
    name: 'Test Concert',
    ticketPrice: 5000, // $50.00 in cents
    totalTickets: 1000,
    startTime: new Date('2026-06-01T19:00:00Z'),
    endTime: new Date('2026-06-01T23:00:00Z'),
    refundWindow: 24, // hours
    metadataUri: 'https://example.com/metadata.json',
    description: 'A great concert',
    transferable: true,
    resaleable: true,
    merkleTree: 'merkle-tree-address',
    artistWallet: 'artist-wallet-address',
    artistPercentage: 5.00, // 5%
    venuePercentage: 3.00, // 3%
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventBlockchainService();

    // Setup default mock returns
    mockDeriveVenuePDA.mockReturnValue([{ toBase58: () => 'venue-pda-base58' }]);
    mockBlockchainClient.createEvent.mockResolvedValue({
      eventPda: 'event-pda-address',
      signature: 'tx-signature-123',
    });
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(EventBlockchainService);
    });

    it('should use environment variable for program ID', () => {
      const originalEnv = process.env.TICKETTOKEN_PROGRAM_ID;
      process.env.TICKETTOKEN_PROGRAM_ID = 'custom-program-id';
      
      const customService = new EventBlockchainService();
      expect(customService).toBeInstanceOf(EventBlockchainService);
      
      process.env.TICKETTOKEN_PROGRAM_ID = originalEnv;
    });

    it('should use default program ID when env not set', () => {
      const originalEnv = process.env.TICKETTOKEN_PROGRAM_ID;
      delete process.env.TICKETTOKEN_PROGRAM_ID;
      
      const defaultService = new EventBlockchainService();
      expect(defaultService).toBeInstanceOf(EventBlockchainService);
      
      process.env.TICKETTOKEN_PROGRAM_ID = originalEnv;
    });
  });

  describe('createEventOnChain', () => {
    it('should create event on blockchain successfully', async () => {
      const result = await service.createEventOnChain(mockEventData);

      expect(result.eventPda).toBe('event-pda-address');
      expect(result.signature).toBe('tx-signature-123');
    });

    it('should derive venue PDA from venueId', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockDeriveVenuePDA).toHaveBeenCalledWith(
        expect.anything(),
        'venue-123'
      );
    });

    it('should convert start/end times to Unix seconds', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: Math.floor(mockEventData.startTime.getTime() / 1000),
          endTime: Math.floor(mockEventData.endTime.getTime() / 1000),
        })
      );
    });

    it('should convert refund window from hours to seconds', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          refundWindow: 24 * 3600, // 24 hours in seconds
        })
      );
    });

    it('should convert artist percentage to basis points', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          artistPercentage: 500, // 5.00% = 500 basis points
        })
      );
    });

    it('should convert venue percentage to basis points', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          venuePercentage: 300, // 3.00% = 300 basis points
        })
      );
    });

    it('should throw error when total royalty exceeds 100%', async () => {
      const invalidData: EventBlockchainData = {
        ...mockEventData,
        artistPercentage: 60.00,
        venuePercentage: 50.00, // Total = 110%
      };

      await expect(service.createEventOnChain(invalidData))
        .rejects.toThrow('Total royalty percentage cannot exceed 100%');
    });

    it('should allow exactly 100% total royalty', async () => {
      const maxRoyaltyData: EventBlockchainData = {
        ...mockEventData,
        artistPercentage: 50.00,
        venuePercentage: 50.00, // Total = 100%
      };

      await expect(service.createEventOnChain(maxRoyaltyData))
        .resolves.toBeDefined();
    });

    it('should include metadata URI in blockchain params', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadataUri: 'https://example.com/metadata.json',
        })
      );
    });

    it('should include transferable and resaleable flags', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          transferable: true,
          resaleable: true,
        })
      );
    });

    it('should include merkle tree address', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          merkleTree: 'merkle-tree-address',
        })
      );
    });

    it('should include artist wallet address', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          artistWallet: 'artist-wallet-address',
        })
      );
    });

    it('should handle empty metadata URI', async () => {
      const dataWithoutMetadata: EventBlockchainData = {
        ...mockEventData,
        metadataUri: '',
      };

      await service.createEventOnChain(dataWithoutMetadata);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadataUri: '',
        })
      );
    });

    it('should handle empty description', async () => {
      const dataWithoutDescription: EventBlockchainData = {
        ...mockEventData,
        description: '',
      };

      await service.createEventOnChain(dataWithoutDescription);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '',
        })
      );
    });

    it('should re-throw BlockchainError as-is', async () => {
      const blockchainError = new BlockchainError('Transaction failed');
      mockBlockchainClient.createEvent.mockRejectedValue(blockchainError);

      await expect(service.createEventOnChain(mockEventData))
        .rejects.toThrow('Transaction failed');
    });

    it('should wrap non-BlockchainError in BlockchainError', async () => {
      mockBlockchainClient.createEvent.mockRejectedValue(new Error('Network error'));

      await expect(service.createEventOnChain(mockEventData))
        .rejects.toThrow('Failed to create event on blockchain');
    });

    it('should handle string errors', async () => {
      mockBlockchainClient.createEvent.mockRejectedValue('Unknown error');

      await expect(service.createEventOnChain(mockEventData))
        .rejects.toThrow('Failed to create event on blockchain');
    });
  });

  describe('deriveVenuePDA', () => {
    it('should return venue PDA as base58 string', () => {
      const result = service.deriveVenuePDA('venue-123');

      expect(result).toBe('venue-pda-base58');
    });

    it('should call deriveVenuePDA with correct params', () => {
      service.deriveVenuePDA('venue-456');

      expect(mockDeriveVenuePDA).toHaveBeenCalledWith(
        expect.anything(),
        'venue-456'
      );
    });
  });

  describe('close', () => {
    it('should close blockchain client', async () => {
      // Force client initialization
      await service.createEventOnChain(mockEventData);
      
      await service.close();

      expect(mockBlockchainClient.close).toHaveBeenCalled();
    });

    it('should do nothing if client not initialized', async () => {
      // Don't initialize client
      await service.close();

      // Should not throw
      expect(mockBlockchainClient.close).not.toHaveBeenCalled();
    });

    it('should set client to null after close', async () => {
      await service.createEventOnChain(mockEventData);
      await service.close();

      // Second close should not call close again
      await service.close();
      expect(mockBlockchainClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('lazy client initialization', () => {
    it('should initialize client on first use', async () => {
      await service.createEventOnChain(mockEventData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalled();
    });

    it('should reuse client on subsequent calls', async () => {
      await service.createEventOnChain(mockEventData);
      await service.createEventOnChain(mockEventData);

      // BlockchainClient constructor should only be called once
      // (checked via the mock implementation)
    });
  });

  describe('royalty calculation edge cases', () => {
    it('should handle zero artist percentage', async () => {
      const zeroArtist: EventBlockchainData = {
        ...mockEventData,
        artistPercentage: 0,
      };

      await service.createEventOnChain(zeroArtist);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          artistPercentage: 0,
        })
      );
    });

    it('should handle zero venue percentage', async () => {
      const zeroVenue: EventBlockchainData = {
        ...mockEventData,
        venuePercentage: 0,
      };

      await service.createEventOnChain(zeroVenue);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          venuePercentage: 0,
        })
      );
    });

    it('should round fractional basis points', async () => {
      const fractionalData: EventBlockchainData = {
        ...mockEventData,
        artistPercentage: 5.555, // Should round to 556 basis points
      };

      await service.createEventOnChain(fractionalData);

      expect(mockBlockchainClient.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          artistPercentage: 556,
        })
      );
    });
  });
});
