/**
 * Unit Tests for SearchService
 *
 * Tests:
 * - Transfer search with filters
 * - Pagination
 * - Sorting
 * - Full-text search
 * - Autocomplete suggestions
 * - Faceted search
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { SearchService } from '../../../src/services/search.service';

jest.mock('../../../src/utils/logger');

describe('SearchService', () => {
  let searchService: SearchService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    searchService = new SearchService(mockPool);

    jest.clearAllMocks();
  });

  describe('searchTransfers()', () => {
    const tenantId = 'tenant-123';

    it('should return paginated search results', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'transfer-1', status: 'COMPLETED' },
            { id: 'transfer-2', status: 'PENDING' }
          ]
        } as any)
        .mockResolvedValueOnce({
          rows: [{ count: '10' }]
        } as any);

      const result = await searchService.searchTransfers(tenantId, {}, { page: 1, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(5);
    });

    it('should filter by status', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        status: ['COMPLETED', 'PENDING']
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.status = ANY');
    });

    it('should filter by fromUserId', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        fromUserId: 'user-123'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.from_user_id = $');
    });

    it('should filter by toUserId', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        toUserId: 'user-456'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.to_user_id = $');
    });

    it('should filter by ticketId', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        ticketId: 'ticket-123'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.ticket_id = $');
    });

    it('should filter by eventId', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        eventId: 'event-123'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('t.event_id = $');
    });

    it('should filter by transferType', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        transferType: ['GIFT', 'SALE']
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.transfer_type = ANY');
    });

    it('should filter by date range', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      await searchService.searchTransfers(tenantId, {
        dateFrom,
        dateTo
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.created_at >= $');
      expect(query).toContain('tt.created_at <= $');
    });

    it('should filter by amount range', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        minAmount: 10,
        maxAmount: 100
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.sale_price >= $');
      expect(query).toContain('tt.sale_price <= $');
    });

    it('should filter by blockchain signature presence', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        hasBlockchainSignature: true
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.blockchain_signature IS NOT NULL');
    });

    it('should filter by blockchain signature absence', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        hasBlockchainSignature: false
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.blockchain_signature IS NULL');
    });

    it('should support full-text search', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        searchTerm: 'test'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ILIKE');
      expect(query).toContain('transfer_code');
      expect(query).toContain('to_email');
      expect(query).toContain('ticket_number');
    });

    it('should combine multiple filters', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {
        status: ['COMPLETED'],
        fromUserId: 'user-123',
        dateFrom: new Date('2024-01-01'),
        searchTerm: 'test'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.status = ANY');
      expect(query).toContain('tt.from_user_id = $');
      expect(query).toContain('tt.created_at >= $');
      expect(query).toContain('ILIKE');
    });

    it('should sort by specified column', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {}, {
        sortBy: 'status',
        sortOrder: 'ASC'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY tt.status ASC');
    });

    it('should default to created_at DESC sorting', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {});

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY tt.created_at DESC');
    });

    it('should sanitize invalid sort column', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {}, {
        sortBy: 'invalid_column',
        sortOrder: 'DESC'
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY tt.created_at DESC');
    });

    it('should calculate pagination offset correctly', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {}, {
        page: 3,
        limit: 20
      });

      const params = mockPool.query.mock.calls[0][1] as any[];
      expect(params[params.length - 2]).toBe(20); // limit
      expect(params[params.length - 1]).toBe(40); // offset (page 3 = skip 40)
    });

    it('should default to page 1 and limit 50', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {});

      const params = mockPool.query.mock.calls[0][1] as any[];
      expect(params[params.length - 2]).toBe(50); // limit
      expect(params[params.length - 1]).toBe(0); // offset
    });

    it('should include JOIN clauses for enriched data', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {});

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('LEFT JOIN tickets t ON');
      expect(query).toContain('LEFT JOIN events e ON');
      expect(query).toContain('LEFT JOIN users u1 ON');
      expect(query).toContain('LEFT JOIN users u2 ON');
    });

    it('should select enriched columns', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers(tenantId, {});

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ticket_number');
      expect(query).toContain('event_name');
      expect(query).toContain('from_user_email');
      expect(query).toContain('to_user_email');
    });

    it('should execute queries in parallel', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      await searchService.searchTransfers(tenantId, {});

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should calculate total pages correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ count: '103' }] } as any);

      const result = await searchService.searchTransfers(tenantId, {}, {
        limit: 25
      });

      expect(result.totalPages).toBe(5); // 103 / 25 = 4.12 -> 5 pages
    });

    it('should handle empty results', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      const result = await searchService.searchTransfers(tenantId, {});

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        searchService.searchTransfers(tenantId, {})
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTransferSuggestions()', () => {
    const tenantId = 'tenant-123';

    it('should return matching suggestions', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { transfer_code: 'ABC123', to_email: 'user@example.com', ticket_number: 'TKT-001' },
          { transfer_code: 'ABC456', to_email: 'admin@example.com', ticket_number: 'TKT-002' }
        ]
      } as any);

      const result = await searchService.getTransferSuggestions(tenantId, 'ABC');

      expect(result).toHaveLength(2);
      expect(result[0].transfer_code).toBe('ABC123');
    });

    it('should use ILIKE for case-insensitive search', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getTransferSuggestions(tenantId, 'test');

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ILIKE');
    });

    it('should limit results to specified count', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getTransferSuggestions(tenantId, 'test', 5);

      const params = mockPool.query.mock.calls[0][1] as any[];
      expect(params[2]).toBe(5);
    });

    it('should default to 10 results', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getTransferSuggestions(tenantId, 'test');

      const params = mockPool.query.mock.calls[0][1] as any[];
      expect(params[2]).toBe(10);
    });

    it('should search across multiple fields', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getTransferSuggestions(tenantId, 'test');

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('transfer_code ILIKE');
      expect(query).toContain('to_email ILIKE');
      expect(query).toContain('ticket_number ILIKE');
    });

    it('should return empty array on error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const result = await searchService.getTransferSuggestions(tenantId, 'test');

      expect(result).toEqual([]);
    });

    it('should use DISTINCT to avoid duplicates', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getTransferSuggestions(tenantId, 'test');

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('SELECT DISTINCT');
    });
  });

  describe('getFacets()', () => {
    const tenantId = 'tenant-123';

    it('should return status and transfer type facets', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { status: 'COMPLETED', count: '10' },
            { status: 'PENDING', count: '5' }
          ]
        } as any)
        .mockResolvedValueOnce({
          rows: [
            { transfer_type: 'GIFT', count: '8' },
            { transfer_type: 'SALE', count: '7' }
          ]
        } as any);

      const result = await searchService.getFacets(tenantId);

      expect(result.status).toHaveLength(2);
      expect(result.transferType).toHaveLength(2);
      expect(result.status[0].status).toBe('COMPLETED');
      expect(result.transferType[0].transfer_type).toBe('GIFT');
    });

    it('should group by status', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getFacets(tenantId);

      const statusQuery = mockPool.query.mock.calls[0][0] as string;
      expect(statusQuery).toContain('GROUP BY status');
    });

    it('should group by transfer type', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getFacets(tenantId);

      const typeQuery = mockPool.query.mock.calls[1][0] as string;
      expect(typeQuery).toContain('GROUP BY transfer_type');
    });

    it('should filter by tenant', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await searchService.getFacets(tenantId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1'),
        [tenantId]
      );
    });

    it('should return empty object on error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const result = await searchService.getFacets(tenantId);

      expect(result).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero as amount filter', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers('tenant-123', {
        minAmount: 0,
        maxAmount: 0
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.sale_price >= $');
      expect(query).toContain('tt.sale_price <= $');
    });

    it('should handle empty filter arrays', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers('tenant-123', {
        status: [],
        transferType: []
      });

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).not.toContain('tt.status = ANY');
      expect(query).not.toContain('tt.transfer_type = ANY');
    });

    it('should handle special characters in search term', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers('tenant-123', {
        searchTerm: "test's \"quoted\" %wildcard%"
      });

      const params = mockPool.query.mock.calls[0][1] as any[];
      expect(params).toContain("%test's \"quoted\" %wildcard%%");
    });

    it('should handle very large page numbers', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0' }]
      } as any);

      await searchService.searchTransfers('tenant-123', {}, {
        page: 1000,
        limit: 50
      });

      const params = mockPool.query.mock.calls[0][1] as any[];
      expect(params[params.length - 1]).toBe(49950); // offset
    });
  });
});
