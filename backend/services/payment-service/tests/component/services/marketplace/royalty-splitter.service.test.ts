/**
 * COMPONENT TEST: RoyaltySplitterService
 *
 * Tests royalty calculation and distribution for resales
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

import { RoyaltySplitterService } from '../../../../src/services/marketplace/royalty-splitter.service';

describe('RoyaltySplitterService Component Tests', () => {
  let service: RoyaltySplitterService;
  let venueId: string;
  let eventId: string;
  let transactionId: string;

  beforeEach(() => {
    venueId = uuidv4();
    eventId = uuidv4();
    transactionId = uuidv4();
    mockQuery.mockReset();
    service = new RoyaltySplitterService();
  });

  // ===========================================================================
  // CALCULATE ROYALTIES
  // ===========================================================================
  describe('calculateRoyalties()', () => {
    it('should calculate royalties with venue settings', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ defaultRoyaltyPercentage: 10 }] }) // venue settings
        .mockResolvedValueOnce({ rows: [] }); // no event override

      const result = await service.calculateRoyalties(100, venueId, eventId);

      expect(result.venueRoyalty).toBe(10); // 10%
      expect(result.venuePercentage).toBe(10);
      expect(result.platformFee).toBe(5); // 5%
      expect(result.sellerProceeds).toBe(85); // 100 - 10 - 5
      expect(result.artistRoyalty).toBe(0);
    });

    it('should use event-specific royalties when set', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ defaultRoyaltyPercentage: 10 }] })
        .mockResolvedValueOnce({
          rows: [{
            venueRoyaltyPercentage: 15,
            artistRoyaltyPercentage: 5,
          }]
        });

      const result = await service.calculateRoyalties(100, venueId, eventId);

      expect(result.venueRoyalty).toBe(15);
      expect(result.venuePercentage).toBe(15);
      expect(result.artistRoyalty).toBe(5);
      expect(result.artistPercentage).toBe(5);
      expect(result.sellerProceeds).toBe(75); // 100 - 15 - 5 - 5
    });

    it('should use default 10% when no settings exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no venue settings
        .mockResolvedValueOnce({ rows: [] }); // no event settings

      const result = await service.calculateRoyalties(100, venueId, eventId);

      expect(result.venuePercentage).toBe(10);
      expect(result.venueRoyalty).toBe(10);
    });

    it('should round to 2 decimal places', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ defaultRoyaltyPercentage: 7 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateRoyalties(99.99, venueId, eventId);

      expect(result.venueRoyalty).toBe(7); // 7% of 99.99 = 6.9993 -> 7.00
    });
  });

  // ===========================================================================
  // DISTRIBUTE ROYALTIES
  // ===========================================================================
  describe('distributeRoyalties()', () => {
    it('should insert distribution records', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.distributeRoyalties(transactionId, {
        venueId,
        venueRoyalty: 10,
        venuePercentage: 10,
        artistId: uuidv4(),
        artistRoyalty: 5,
        artistPercentage: 5,
        platformFee: 5,
      });

      // Should insert 3 records (venue, artist, platform)
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO royalty_distributions'),
        expect.arrayContaining([transactionId, 'venue'])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO royalty_distributions'),
        expect.arrayContaining([transactionId, 'artist'])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO royalty_distributions'),
        expect.arrayContaining([transactionId, 'platform'])
      );
    });

    it('should skip zero-amount distributions', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.distributeRoyalties(transactionId, {
        venueId,
        venueRoyalty: 10,
        venuePercentage: 10,
        artistId: null,
        artistRoyalty: 0,
        artistPercentage: 0,
        platformFee: 5,
      });

      // Should insert only 2 records (venue, platform - no artist)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // GET ROYALTY REPORT
  // ===========================================================================
  describe('getRoyaltyReport()', () => {
    it('should return venue royalty report', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            transaction_count: '150',
            total_royalties: '15000.00',
            average_royalty: '100.00',
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { event_id: uuidv4(), event_name: 'Concert A', transactions: '100', royalties: '10000' },
            { event_id: uuidv4(), event_name: 'Concert B', transactions: '50', royalties: '5000' },
          ]
        });

      const result = await service.getRoyaltyReport(venueId, startDate, endDate);

      expect(result.totalRoyalties).toBe(15000);
      expect(result.transactionCount).toBe(150);
      expect(result.averageRoyalty).toBe(100);
      expect(result.byEvent).toHaveLength(2);
    });

    it('should handle no royalties', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            transaction_count: '0',
            total_royalties: null,
            average_royalty: null,
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getRoyaltyReport(
        venueId,
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.totalRoyalties).toBe(0);
      expect(result.transactionCount).toBe(0);
      expect(result.byEvent).toHaveLength(0);
    });
  });
});
