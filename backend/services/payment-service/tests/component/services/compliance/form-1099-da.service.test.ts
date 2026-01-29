/**
 * COMPONENT TEST: Form1099DAService
 *
 * Tests IRS Form 1099-DA generation for digital asset sales
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock query
const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

// Mock compliance config - use a future date so tests run
jest.mock('../../../../src/config/compliance', () => ({
  complianceConfig: {
    tax: {
      digitalAssetReporting: {
        startDate: '2020-01-01', // Past date so reporting is enabled
        threshold: 600,
      },
    },
  },
}));

import { Form1099DAService } from '../../../../src/services/compliance/form-1099-da.service';

describe('Form1099DAService Component Tests', () => {
  let service: Form1099DAService;
  let userId: string;

  beforeEach(() => {
    userId = uuidv4();
    mockQuery.mockReset();
    service = new Form1099DAService();
  });

  // ===========================================================================
  // GENERATE FORM 1099-DA
  // ===========================================================================
  describe('generateForm1099DA()', () => {
    it('should return not required if below threshold', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('marketplace_listings')) {
          return { rows: [{ proceeds_cents: 30000, cost_basis_cents: 20000, event_name: 'Test', disposed_date: new Date(), acquired_date: new Date() }] }; // $300 < $600
        }
        if (sql.includes('users')) {
          return { rows: [{ name: 'Test User', address: '123 Main St', tin: '123-45-6789' }] };
        }
        return { rows: [] };
      });

      const result = await service.generateForm1099DA(userId, 2025);

      expect(result.required).toBe(false);
    });

    it('should generate form when above threshold', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('marketplace_listings')) {
          return {
            rows: [{
              transaction_id: uuidv4(),
              disposed_date: new Date('2025-03-15'),
              proceeds_cents: 100000, // $1000
              cost_basis_cents: 50000, // $500
              acquired_date: new Date('2024-01-01'),
              event_name: 'Concert',
              ticket_id: uuidv4(),
            }]
          };
        }
        if (sql.includes('users')) {
          return {
            rows: [{
              name: 'John Doe',
              address: '123 Main St, Nashville, TN 37203',
              tin: '123-45-6789',
            }]
          };
        }
        return { rows: [] };
      });

      const result = await service.generateForm1099DA(userId, 2025);

      expect(result.required).toBe(true);
      expect(result.formData).toBeDefined();
      expect(result.formData.summary.totalProceeds).toBe(1000);
      expect(result.formData.summary.totalCostBasis).toBe(500);
      expect(result.formData.summary.totalGain).toBe(500);
    });

    it('should include payer and recipient info', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('marketplace_listings')) {
          return {
            rows: [{
              transaction_id: uuidv4(),
              disposed_date: new Date(),
              proceeds_cents: 100000,
              cost_basis_cents: 50000,
              acquired_date: new Date(),
              event_name: 'Concert',
              ticket_id: uuidv4(),
            }]
          };
        }
        if (sql.includes('users')) {
          return {
            rows: [{ name: 'Jane Doe', address: '456 Oak Ave', tin: '987-65-4321' }]
          };
        }
        return { rows: [] };
      });

      const result = await service.generateForm1099DA(userId, 2025);

      expect(result.formData.recipientInfo.name).toBe('Jane Doe');
      expect(result.formData.payerInfo.name).toBe('TicketToken Inc.');
    });

    it('should convert cents to dollars', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('marketplace_listings')) {
          return {
            rows: [{
              transaction_id: uuidv4(),
              disposed_date: new Date(),
              proceeds_cents: 150000, // 1500.00
              cost_basis_cents: 75000, // 750.00
              acquired_date: new Date(),
              event_name: 'Concert',
              ticket_id: uuidv4(),
            }]
          };
        }
        if (sql.includes('users')) {
          return { rows: [{ name: 'Test', address: 'Addr', tin: '111-11-1111' }] };
        }
        return { rows: [] };
      });

      const result = await service.generateForm1099DA(userId, 2025);

      expect(result.transactions![0].proceeds).toBe(1500);
      expect(result.transactions![0].costBasis).toBe(750);
    });

    it('should handle no transactions', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('marketplace_listings')) {
          return { rows: [] };
        }
        if (sql.includes('users')) {
          return { rows: [{ name: 'Test', address: 'Addr', tin: '111-11-1111' }] };
        }
        return { rows: [] };
      });

      const result = await service.generateForm1099DA(userId, 2025);

      expect(result.required).toBe(false);
      expect(result.transactions).toEqual([]);
    });
  });

  // ===========================================================================
  // RECORD FORM GENERATION
  // ===========================================================================
  describe('recordFormGeneration()', () => {
    it('should insert form record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const formData = {
        summary: { totalProceeds: 1000, transactionCount: 5 }
      };

      await service.recordFormGeneration(userId, 2025, formData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tax_forms_1099da'),
        expect.arrayContaining([userId, 2025])
      );
    });
  });

  // ===========================================================================
  // BATCH GENERATE
  // ===========================================================================
  describe('batchGenerate1099DA()', () => {
    it('should process all eligible users', async () => {
      const user1 = uuidv4();
      const user2 = uuidv4();

      mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
        // Find eligible users
        if (sql.includes('SELECT DISTINCT') && sql.includes('seller_id')) {
          return {
            rows: [
              { user_id: user1, total_proceeds: 1000, transaction_count: 2 },
              { user_id: user2, total_proceeds: 800, transaction_count: 1 },
            ]
          };
        }
        // NFT transactions for each user
        if (sql.includes('marketplace_listings ml') && sql.includes('JOIN')) {
          return {
            rows: [{
              transaction_id: uuidv4(),
              disposed_date: new Date(),
              proceeds_cents: 100000,
              cost_basis_cents: 50000,
              acquired_date: new Date(),
              event_name: 'Concert',
              ticket_id: uuidv4(),
            }]
          };
        }
        if (sql.includes('users')) {
          return { rows: [{ name: 'Test', address: 'Addr', tin: '111-11-1111' }] };
        }
        if (sql.includes('INSERT INTO tax_forms_1099da')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await service.batchGenerate1099DA(2025);

      expect(result.totalRequired).toBe(2);
      expect(result.totalGenerated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors per user', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT DISTINCT') && sql.includes('seller_id')) {
          return { rows: [{ user_id: uuidv4(), total_proceeds: 1000 }] };
        }
        if (sql.includes('marketplace_listings ml') && sql.includes('JOIN')) {
          return { rows: [{ proceeds_cents: 100000, cost_basis_cents: 50000, event_name: 'Test', disposed_date: new Date(), acquired_date: new Date(), transaction_id: uuidv4(), ticket_id: uuidv4() }] };
        }
        if (sql.includes('users')) {
          throw new Error('User not found');
        }
        return { rows: [] };
      });

      const result = await service.batchGenerate1099DA(2025);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // GET FORM STATUS
  // ===========================================================================
  describe('getFormStatus()', () => {
    it('should return existing form status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          status: 'generated',
          generated_at: new Date(),
          total_proceeds: '1500.00',
          transaction_count: 3,
        }]
      });

      const result = await service.getFormStatus(userId, 2025);

      expect(result.status).toBe('generated');
      expect(result.downloadUrl).toContain('1099-da');
      expect(result.summary.totalProceeds).toBe(1500);
    });

    it('should check if form is needed when not generated', async () => {
      // No existing form
      mockQuery.mockImplementationOnce(async () => ({ rows: [] }));
      // Check transactions - returns empty
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('marketplace_listings')) {
          return { rows: [] };
        }
        if (sql.includes('users')) {
          return { rows: [{ name: 'Test', address: 'Addr', tin: '111' }] };
        }
        return { rows: [] };
      });

      const result = await service.getFormStatus(userId, 2025);

      expect(result.status).toBe('not_required');
    });
  });
});
