import { Form1099DAService } from '../../../../src/services/compliance/form-1099-da.service';
import * as database from '../../../../src/config/database';

// Mock dependencies
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('Form1099DAService', () => {
  let service: Form1099DAService;
  let mockQuery: jest.MockedFunction<typeof database.query>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new Form1099DAService();
    mockQuery = database.query as jest.MockedFunction<typeof database.query>;
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  describe('generateForm1099DA() - Not Required', () => {
    it('should return not required if before start date', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01').getTime());

      const result = await service.generateForm1099DA('user-123', 2024);

      expect(result.required).toBe(false);
      expect(result.formData).toBeUndefined();

      jest.restoreAllMocks();
    });

    it('should return not required if below threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          transaction_id: 'tx-1',
          disposed_date: new Date('2025-06-15'),
          proceeds: '300',
          cost_basis: '250',
          acquired_date: new Date('2025-01-10'),
          event_name: 'Concert A',
          ticket_id: 'ticket-1'
        }],
        rowCount: 1
      } as any);

      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.required).toBe(false);
      expect(result.transactions).toHaveLength(1);
    });

    it('should include transactions even when not required', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          transaction_id: 'tx-1',
          disposed_date: new Date('2025-06-15'),
          proceeds: '100',
          cost_basis: '80',
          acquired_date: new Date('2025-01-10'),
          event_name: 'Concert',
          ticket_id: 'ticket-1'
        }],
        rowCount: 1
      } as any);

      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.required).toBe(false);
      expect(result.transactions).toBeDefined();
      expect(result.transactions?.length).toBe(1);
    });

    it('should return not required if no transactions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.required).toBe(false);
      expect(result.transactions).toHaveLength(0);
    });

    it('should calculate total proceeds correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            transaction_id: 'tx-1',
            disposed_date: new Date('2025-06-15'),
            proceeds: '200',
            cost_basis: '150',
            acquired_date: new Date('2025-01-10'),
            event_name: 'Concert A',
            ticket_id: 'ticket-1'
          },
          {
            transaction_id: 'tx-2',
            disposed_date: new Date('2025-07-20'),
            proceeds: '300',
            cost_basis: '250',
            acquired_date: new Date('2025-02-15'),
            event_name: 'Concert B',
            ticket_id: 'ticket-2'
          }
        ],
        rowCount: 2
      } as any);

      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.required).toBe(false);
      expect(result.transactions?.length).toBe(2);
    });
  });

  describe('generateForm1099DA() - Required', () => {
    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              transaction_id: 'tx-1',
              disposed_date: new Date('2025-06-15'),
              proceeds: '400',
              cost_basis: '300',
              acquired_date: new Date('2025-01-10'),
              event_name: 'Concert A',
              ticket_id: 'ticket-1'
            },
            {
              transaction_id: 'tx-2',
              disposed_date: new Date('2025-07-20'),
              proceeds: '300',
              cost_basis: '200',
              acquired_date: new Date('2025-02-15'),
              event_name: 'Concert B',
              ticket_id: 'ticket-2'
            }
          ],
          rowCount: 2
        } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-123',
            email: 'test@example.com',
            name: 'John Doe',
            address: '123 Main St, Nashville, TN',
            tin: '123-45-6789',
            tin_type: 'SSN'
          }],
          rowCount: 1
        } as any);
    });

    it('should generate form when above threshold', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.required).toBe(true);
      expect(result.formData).toBeDefined();
    });

    it('should include recipient info', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.recipientInfo).toEqual({
        name: 'John Doe',
        address: '123 Main St, Nashville, TN',
        tin: '123-45-6789'
      });
    });

    it('should include payer info', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.payerInfo).toEqual({
        name: 'TicketToken Inc.',
        address: '123 Music Row, Nashville, TN 37203',
        tin: '12-3456789'
      });
    });

    it('should include transaction details', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.transactions).toHaveLength(2);
      expect(result.formData?.transactions[0]).toHaveProperty('dateAcquired');
      expect(result.formData?.transactions[0]).toHaveProperty('dateDisposed');
      expect(result.formData?.transactions[0]).toHaveProperty('proceeds');
      expect(result.formData?.transactions[0]).toHaveProperty('costBasis');
      expect(result.formData?.transactions[0]).toHaveProperty('gain');
    });

    it('should calculate gains correctly', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.transactions[0].gain).toBe(100);
      expect(result.formData?.transactions[1].gain).toBe(100);
    });

    it('should include summary with totals', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.summary).toEqual({
        totalProceeds: 700,
        totalCostBasis: 500,
        totalGain: 200,
        transactionCount: 2
      });
    });

    it('should include tax year', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.taxYear).toBe(2025);
    });

    it('should include asset descriptions', async () => {
      const result = await service.generateForm1099DA('user-123', 2025);

      expect(result.formData?.transactions[0].assetDescription).toBe('NFT Ticket - Concert A');
      expect(result.formData?.transactions[1].assetDescription).toBe('NFT Ticket - Concert B');
    });
  });

  describe('getUserNFTTransactions()', () => {
    it('should query transactions for tax year', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service['getUserNFTTransactions']('user-123', 2025);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM resale_listings'),
        expect.arrayContaining(['user-123', expect.any(Date), expect.any(Date)])
      );
    });

    it('should filter by year start and end dates', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service['getUserNFTTransactions']('user-123', 2025);

      const args = mockQuery.mock.calls[0]?.[1];
      if (args) {
        expect(args[1]).toEqual(new Date(2025, 0, 1));
        expect(args[2]).toEqual(new Date(2026, 0, 1));
      }
    });

    it('should parse transaction data correctly', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          transaction_id: 'tx-1',
          disposed_date: new Date('2025-06-15'),
          proceeds: '500.50',
          cost_basis: '400.25',
          acquired_date: new Date('2025-01-10'),
          event_name: 'Concert',
          ticket_id: 'ticket-1'
        }],
        rowCount: 1
      } as any);

      const result = await service['getUserNFTTransactions']('user-123', 2025);

      expect(result[0]).toEqual({
        transactionId: 'tx-1',
        disposedDate: expect.any(Date),
        proceeds: 500.50,
        costBasis: 400.25,
        acquiredDate: expect.any(Date),
        eventName: 'Concert',
        ticketId: 'ticket-1'
      });
    });

    it('should handle multiple transactions', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            transaction_id: 'tx-1',
            disposed_date: new Date('2025-06-15'),
            proceeds: '400',
            cost_basis: '300',
            acquired_date: new Date('2025-01-10'),
            event_name: 'Concert A',
            ticket_id: 'ticket-1'
          },
          {
            transaction_id: 'tx-2',
            disposed_date: new Date('2025-07-20'),
            proceeds: '500',
            cost_basis: '400',
            acquired_date: new Date('2025-02-15'),
            event_name: 'Concert B',
            ticket_id: 'ticket-2'
          }
        ],
        rowCount: 2
      } as any);

      const result = await service['getUserNFTTransactions']('user-123', 2025);

      expect(result).toHaveLength(2);
    });

    it('should return empty array if no transactions', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await service['getUserNFTTransactions']('user-123', 2025);

      expect(result).toEqual([]);
    });

    it('should filter by sold status', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service['getUserNFTTransactions']('user-123', 2025);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'sold'"),
        expect.any(Array)
      );
    });
  });

  describe('getUserTaxInfo()', () => {
    it('should retrieve user tax information', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          name: 'John Doe',
          address: '123 Main St',
          tin: '123-45-6789',
          tin_type: 'SSN'
        }],
        rowCount: 1
      } as any);

      const result = await service['getUserTaxInfo']('user-123');

      expect(result.name).toBe('John Doe');
      expect(result.tin).toBe('123-45-6789');
    });

    it('should query with user ID', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'user-123', name: 'Test', tin: '123' }],
        rowCount: 1
      } as any);

      await service['getUserTaxInfo']('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM users'),
        ['user-123']
      );
    });

    it('should join user_tax_info table', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'user-123', name: 'Test', tin: '123' }],
        rowCount: 1
      } as any);

      await service['getUserTaxInfo']('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN user_tax_info'),
        expect.any(Array)
      );
    });

    it('should throw error if user not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await expect(service['getUserTaxInfo']('nonexistent')).rejects.toThrow('User not found');
    });

    it('should concatenate first and last name', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'user-123',
          name: 'John Doe',
          tin: '123-45-6789'
        }],
        rowCount: 1
      } as any);

      const result = await service['getUserTaxInfo']('user-123');

      expect(result.name).toBe('John Doe');
    });
  });

  describe('recordFormGeneration()', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    });

    it('should insert form record', async () => {
      const formData = {
        summary: {
          totalProceeds: 1000,
          transactionCount: 3
        }
      };

      await service.recordFormGeneration('user-123', 2025, formData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tax_forms_1099da'),
        expect.arrayContaining(['user-123', 2025, JSON.stringify(formData), 1000, 3])
      );
    });

    it('should set status to generated', async () => {
      const formData = {
        summary: { totalProceeds: 1000, transactionCount: 3 }
      };

      await service.recordFormGeneration('user-123', 2025, formData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'generated'"),
        expect.any(Array)
      );
    });

    it('should serialize form data as JSON', async () => {
      const formData = {
        recipientInfo: { name: 'Test User' },
        summary: { totalProceeds: 1000, transactionCount: 3 }
      };

      await service.recordFormGeneration('user-123', 2025, formData);

      const args = mockQuery.mock.calls[0]?.[1];
      if (args) {
        expect(args[2]).toBe(JSON.stringify(formData));
      }
    });

    it('should include total proceeds', async () => {
      const formData = {
        summary: { totalProceeds: 2500, transactionCount: 5 }
      };

      await service.recordFormGeneration('user-123', 2025, formData);

      const args = mockQuery.mock.calls[0]?.[1];
      if (args) {
        expect(args[3]).toBe(2500);
      }
    });

    it('should include transaction count', async () => {
      const formData = {
        summary: { totalProceeds: 1000, transactionCount: 7 }
      };

      await service.recordFormGeneration('user-123', 2025, formData);

      const args = mockQuery.mock.calls[0]?.[1];
      if (args) {
        expect(args[4]).toBe(7);
      }
    });
  });

  describe('batchGenerate1099DA()', () => {
    it('should query users meeting threshold', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service.batchGenerate1099DA(2025);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAVING SUM(rl.price) >= $2'),
        expect.arrayContaining([2025, 600])
      );
    });

    it('should generate forms for qualifying users', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user-1', total_proceeds: '800', transaction_count: '2' },
            { user_id: 'user-2', total_proceeds: '1000', transaction_count: '3' }
          ],
          rowCount: 2
        } as any)
        .mockResolvedValue({ rows: [{ transaction_id: 'tx-1', proceeds: '800', cost_basis: '600', disposed_date: new Date(), acquired_date: new Date(), event_name: 'Event', ticket_id: 't1' }], rowCount: 1 } as any)
        .mockResolvedValue({ rows: [{ id: 'user-1', name: 'User One', tin: '111' }], rowCount: 1 } as any)
        .mockResolvedValue({ rows: [], rowCount: 0 } as any)
        .mockResolvedValue({ rows: [{ transaction_id: 'tx-2', proceeds: '1000', cost_basis: '700', disposed_date: new Date(), acquired_date: new Date(), event_name: 'Event', ticket_id: 't2' }], rowCount: 1 } as any)
        .mockResolvedValue({ rows: [{ id: 'user-2', name: 'User Two', tin: '222' }], rowCount: 1 } as any)
        .mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await service.batchGenerate1099DA(2025);

      expect(result.totalGenerated).toBe(2);
      expect(result.totalRequired).toBe(2);
    });

    it('should return error count', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', total_proceeds: '800', transaction_count: '2' }],
          rowCount: 1
        } as any)
        .mockRejectedValue(new Error('Database error'));

      const result = await service.batchGenerate1099DA(2025);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].userId).toBe('user-1');
    });

    it('should handle empty user list', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await service.batchGenerate1099DA(2025);

      expect(result.totalGenerated).toBe(0);
      expect(result.totalRequired).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture error messages', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', total_proceeds: '800', transaction_count: '2' }],
          rowCount: 1
        } as any)
        .mockRejectedValue(new Error('Specific error'));

      const result = await service.batchGenerate1099DA(2025);

      expect(result.errors[0].error).toBe('Specific error');
    });

    it('should continue processing after error', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user-1', total_proceeds: '800', transaction_count: '2' },
            { user_id: 'user-2', total_proceeds: '1000', transaction_count: '3' }
          ],
          rowCount: 2
        } as any)
        .mockRejectedValueOnce(new Error('Error for user-1'))
        .mockResolvedValue({ rows: [{ transaction_id: 'tx-2', proceeds: '1000', cost_basis: '700', disposed_date: new Date(), acquired_date: new Date(), event_name: 'Event', ticket_id: 't2' }], rowCount: 1 } as any)
        .mockResolvedValue({ rows: [{ id: 'user-2', name: 'User Two', tin: '222' }], rowCount: 1 } as any)
        .mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await service.batchGenerate1099DA(2025);

      expect(result.totalGenerated).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should filter by tax year', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service.batchGenerate1099DA(2024);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([2024, 600])
      );
    });
  });

  describe('getFormStatus()', () => {
    it('should return existing form status', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          status: 'generated',
          generated_at: new Date('2025-12-31'),
          form_data: JSON.stringify({ summary: { totalProceeds: 1000, transactionCount: 3 } })
        }],
        rowCount: 1
      } as any);

      const result = await service.getFormStatus('user-123', 2025);

      expect(result.status).toBe('generated');
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should return download URL for generated form', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          status: 'generated',
          generated_at: new Date('2025-12-31'),
          form_data: JSON.stringify({ summary: { totalProceeds: 1000, transactionCount: 3 } })
        }],
        rowCount: 1
      } as any);

      const result = await service.getFormStatus('user-123', 2025);

      expect(result.downloadUrl).toBe('/api/tax/forms/1099-da/user-123/2025');
    });

    it('should parse form summary from JSON', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          status: 'generated',
          generated_at: new Date('2025-12-31'),
          form_data: JSON.stringify({ summary: { totalProceeds: 1500, transactionCount: 5 } })
        }],
        rowCount: 1
      } as any);

      const result = await service.getFormStatus('user-123', 2025);

      expect(result.summary).toEqual({ totalProceeds: 1500, transactionCount: 5 });
    });

    it('should check if form needed when not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({
          rows: [{
            transaction_id: 'tx-1',
            proceeds: '800',
            cost_basis: '600',
            disposed_date: new Date(),
            acquired_date: new Date(),
            event_name: 'Concert',
            ticket_id: 't1'
          }],
          rowCount: 1
        } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 'user-123', name: 'Test', tin: '123' }],
          rowCount: 1
        } as any);

      const result = await service.getFormStatus('user-123', 2025);

      expect(result.status).toBe('pending');
    });

    it('should return not_required if below threshold', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({
          rows: [{
            transaction_id: 'tx-1',
            proceeds: '100',
            cost_basis: '80',
            disposed_date: new Date(),
            acquired_date: new Date(),
            event_name: 'Concert',
            ticket_id: 't1'
          }],
          rowCount: 1
        } as any);

      const result = await service.getFormStatus('user-123', 2025);

      expect(result.status).toBe('not_required');
    });

    it('should query for most recent form', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await service.getFormStatus('user-123', 2025);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY generated_at DESC'),
        ['user-123', 2025]
      );
    });
  });
});
