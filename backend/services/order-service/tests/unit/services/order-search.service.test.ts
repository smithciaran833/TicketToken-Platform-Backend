/**
 * Unit Tests: Order Search Service
 * Tests order search with filters, saved searches, and history
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

import { OrderSearchService } from '../../../src/services/order-search.service';
import { FraudRiskLevel } from '../../../src/types/admin.types';

describe('OrderSearchService', () => {
  let service: OrderSearchService;
  const tenantId = 'tenant-123';
  const adminUserId = 'admin-456';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderSearchService(mockPool as any);
  });

  describe('searchOrders', () => {
    const sampleOrders = [
      { id: 'order-1', order_number: 'ORD-001', customer_name: 'John Doe', customer_email: 'john@example.com', status: 'CONFIRMED', total_amount: 50.00, event_id: 'event-1', created_at: new Date(), has_notes: false, is_flagged: false, risk_level: 'low' },
    ];

    it('should search with no filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      const result = await service.searchOrders(tenantId, {});

      expect(result.total).toBe(1);
      expect(result.orders).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    it('should apply full-text search query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { query: 'concert' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('plainto_tsquery'),
        expect.arrayContaining(['concert'])
      );
    });

    it('should filter by order ID', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { orderId: 'order-123' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('o.id ='),
        expect.arrayContaining(['order-123'])
      );
    });

    it('should filter by customer email with fuzzy match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { customerEmail: 'john@' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%john@%'])
      );
    });

    it('should filter by status array', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { status: ['CONFIRMED', 'COMPLETED'] });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY'),
        expect.arrayContaining([['CONFIRMED', 'COMPLETED']])
      );
    });

    it('should filter by date range', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-01-31');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { dateFrom, dateTo });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >='),
        expect.arrayContaining([dateFrom, dateTo])
      );
    });

    it('should filter by amount range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { minAmount: 10, maxAmount: 100 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('total_amount_cents >='),
        expect.arrayContaining([1000, 10000]) // Converted to cents
      );
    });

    it('should filter by hasNotes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { hasNotes: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS(SELECT 1 FROM order_notes'),
        expect.any(Array)
      );
    });

    it('should filter by isFlagged', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { isFlagged: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_flagged = true'),
        expect.any(Array)
      );
    });

    it('should filter by risk level', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      await service.searchOrders(tenantId, { riskLevel: [FraudRiskLevel.HIGH, FraudRiskLevel.CRITICAL] });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('risk_level = ANY'),
        expect.arrayContaining([[FraudRiskLevel.HIGH, FraudRiskLevel.CRITICAL]])
      );
    });

    it('should paginate results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: sampleOrders });

      const result = await service.searchOrders(tenantId, {}, 3, 20);

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(20);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET'),
        expect.arrayContaining([20, 40]) // pageSize, offset
      );
    });
  });

  describe('saveSearch', () => {
    it('should save search filters', async () => {
      const filters = { status: ['CONFIRMED'], minAmount: 50 };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'search-1', tenant_id: tenantId, admin_user_id: adminUserId, name: 'My Search', filters, is_default: false, created_at: new Date(), updated_at: new Date() }] });

      const result = await service.saveSearch(tenantId, adminUserId, 'My Search', filters);

      expect(result.name).toBe('My Search');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO saved_searches'),
        expect.arrayContaining([tenantId, adminUserId, 'My Search', JSON.stringify(filters), false])
      );
    });

    it('should save as default search', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'search-1', tenant_id: tenantId, admin_user_id: adminUserId, name: 'Default', filters: {}, is_default: true, created_at: new Date(), updated_at: new Date() }] });

      await service.saveSearch(tenantId, adminUserId, 'Default', {}, true);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([true])
      );
    });
  });

  describe('getSavedSearches', () => {
    it('should return saved searches ordered by default first', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [
        { id: 'search-1', tenant_id: tenantId, admin_user_id: adminUserId, name: 'Default', filters: {}, is_default: true, created_at: new Date(), updated_at: new Date() },
        { id: 'search-2', tenant_id: tenantId, admin_user_id: adminUserId, name: 'Other', filters: {}, is_default: false, created_at: new Date(), updated_at: new Date() },
      ]});

      const result = await service.getSavedSearches(tenantId, adminUserId);

      expect(result).toHaveLength(2);
      expect(result[0].isDefault).toBe(true);
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete saved search', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.deleteSavedSearch('search-1', tenantId, adminUserId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM saved_searches'),
        ['search-1', tenantId, adminUserId]
      );
    });
  });

  describe('recordSearchHistory', () => {
    it('should record search history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.recordSearchHistory(tenantId, adminUserId, 'concert', { status: ['CONFIRMED'] }, 25);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO search_history'),
        expect.arrayContaining([tenantId, adminUserId, 'concert', expect.any(String), 25])
      );
    });
  });

  describe('getSearchHistory', () => {
    it('should return search history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [
        { id: 'hist-1', tenant_id: tenantId, admin_user_id: adminUserId, query: 'test', filters: {}, results_count: 10, created_at: new Date() },
      ]});

      const result = await service.getSearchHistory(tenantId, adminUserId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].query).toBe('test');
    });
  });
});
