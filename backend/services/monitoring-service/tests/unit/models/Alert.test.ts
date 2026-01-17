import { AlertModel, IAlert } from '../../../src/models/Alert';

describe('AlertModel', () => {
  let alertModel: AlertModel;
  let mockDb: any;
  let mockQueryBuilder: any;

  const createMockAlert = (overrides: Partial<IAlert> = {}): IAlert => ({
    id: 'alert-123',
    name: 'Test Alert',
    type: 'error',
    severity: 'high',
    message: 'Test alert message',
    source: 'test-service',
    metadata: { key: 'value' },
    resolved: false,
    resolved_at: undefined,
    created_at: new Date('2024-01-15T10:00:00Z'),
    updated_at: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    // Create a self-referencing mock for chaining
    mockQueryBuilder = {
      insert: jest.fn(),
      select: jest.fn(),
      where: jest.fn(),
      orWhere: jest.fn(),
      first: jest.fn(),
      update: jest.fn(),
      del: jest.fn(),
      returning: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
    };

    // Make all chainable methods return the builder
    mockQueryBuilder.insert.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.update.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit.mockReturnValue(mockQueryBuilder);

    mockDb = jest.fn().mockReturnValue(mockQueryBuilder);
    alertModel = new AlertModel(mockDb);
  });

  describe('constructor', () => {
    it('should use provided db instance', () => {
      const customDb = jest.fn();
      const model = new AlertModel(customDb);
      
      expect(model).toBeInstanceOf(AlertModel);
    });

    it('should use default db when none provided', () => {
      expect(() => new AlertModel()).not.toThrow();
    });
  });

  describe('create', () => {
    it('should insert alert and return created record', async () => {
      const alertData: IAlert = {
        name: 'New Alert',
        type: 'warning',
        severity: 'medium',
        message: 'Warning message',
        source: 'api-service',
      };

      const createdAlert = createMockAlert(alertData);
      mockQueryBuilder.returning.mockResolvedValue([createdAlert]);

      const result = await alertModel.create(alertData);

      expect(mockDb).toHaveBeenCalledWith('alerts');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(alertData);
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdAlert);
    });

    it('should handle all alert types', async () => {
      const types: Array<'error' | 'warning' | 'info'> = ['error', 'warning', 'info'];

      for (const type of types) {
        const alertData: IAlert = {
          name: `${type} Alert`,
          type,
          severity: 'low',
          message: `${type} message`,
          source: 'test',
        };

        const createdAlert = createMockAlert(alertData);
        mockQueryBuilder.returning.mockResolvedValue([createdAlert]);

        const result = await alertModel.create(alertData);

        expect(result.type).toBe(type);
      }
    });

    it('should handle all severity levels', async () => {
      const severities: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low', 'medium', 'high', 'critical'
      ];

      for (const severity of severities) {
        const alertData: IAlert = {
          name: `${severity} Alert`,
          type: 'error',
          severity,
          message: 'Test',
          source: 'test',
        };

        const createdAlert = createMockAlert(alertData);
        mockQueryBuilder.returning.mockResolvedValue([createdAlert]);

        const result = await alertModel.create(alertData);

        expect(result.severity).toBe(severity);
      }
    });

    it('should handle metadata as JSON', async () => {
      const alertData: IAlert = {
        name: 'Alert with metadata',
        type: 'info',
        severity: 'low',
        message: 'Test',
        source: 'test',
        metadata: {
          errorCode: 500,
          stackTrace: 'Error at line 42',
          tags: ['production', 'critical'],
        },
      };

      const createdAlert = createMockAlert(alertData);
      mockQueryBuilder.returning.mockResolvedValue([createdAlert]);

      const result = await alertModel.create(alertData);

      expect(result.metadata).toEqual(alertData.metadata);
    });
  });

  describe('findById', () => {
    it('should return alert when found', async () => {
      const alert = createMockAlert();
      mockQueryBuilder.first.mockResolvedValue(alert);

      const result = await alertModel.findById('alert-123');

      expect(mockDb).toHaveBeenCalledWith('alerts');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'alert-123' });
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toEqual(alert);
    });

    it('should return null when alert not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await alertModel.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when first() returns null', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await alertModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findUnresolved', () => {
    it('should return unresolved alerts ordered by severity and date', async () => {
      const unresolvedAlerts = [
        createMockAlert({ id: '1', severity: 'critical', resolved: false }),
        createMockAlert({ id: '2', severity: 'high', resolved: false }),
        createMockAlert({ id: '3', severity: 'medium', resolved: false }),
      ];

      // The last orderBy in the chain returns the result
      mockQueryBuilder.orderBy
        .mockReturnValueOnce(mockQueryBuilder) // first orderBy returns builder
        .mockResolvedValueOnce(unresolvedAlerts); // second orderBy returns results

      const result = await alertModel.findUnresolved();

      expect(mockDb).toHaveBeenCalledWith('alerts');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ resolved: false });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('severity', 'desc');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result).toEqual(unresolvedAlerts);
    });

    it('should return empty array when no unresolved alerts', async () => {
      mockQueryBuilder.orderBy
        .mockReturnValueOnce(mockQueryBuilder)
        .mockResolvedValueOnce([]);

      const result = await alertModel.findUnresolved();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update alert and return updated record', async () => {
      const updateData = { message: 'Updated message', severity: 'critical' as const };
      const updatedAlert = createMockAlert({ ...updateData });

      mockQueryBuilder.returning.mockResolvedValue([updatedAlert]);

      const result = await alertModel.update('alert-123', updateData);

      expect(mockDb).toHaveBeenCalledWith('alerts');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'alert-123' });
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updateData,
          updated_at: expect.any(Date),
        })
      );
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedAlert);
    });

    it('should return null when alert not found', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await alertModel.update('non-existent', { message: 'test' });

      expect(result).toBeNull();
    });

    it('should return null when returning undefined', async () => {
      mockQueryBuilder.returning.mockResolvedValue([undefined]);

      const result = await alertModel.update('alert-123', { message: 'test' });

      expect(result).toBeNull();
    });

    it('should set updated_at timestamp', async () => {
      const beforeUpdate = new Date();
      mockQueryBuilder.returning.mockResolvedValue([createMockAlert()]);

      await alertModel.update('alert-123', { message: 'test' });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
      expect(updateCall.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should allow partial updates', async () => {
      const partialUpdate = { severity: 'low' as const };
      mockQueryBuilder.returning.mockResolvedValue([createMockAlert(partialUpdate)]);

      await alertModel.update('alert-123', partialUpdate);

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'low' })
      );
    });
  });

  describe('resolve', () => {
    it('should resolve alert and return true on success', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      const result = await alertModel.resolve('alert-123');

      expect(mockDb).toHaveBeenCalledWith('alerts');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'alert-123' });
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({
        resolved: true,
        resolved_at: expect.any(Date),
      });
      expect(result).toBe(true);
    });

    it('should return false when alert not found', async () => {
      mockQueryBuilder.update.mockResolvedValue(0);

      const result = await alertModel.resolve('non-existent');

      expect(result).toBe(false);
    });

    it('should set resolved_at timestamp', async () => {
      const beforeResolve = new Date();
      mockQueryBuilder.update.mockResolvedValue(1);

      await alertModel.resolve('alert-123');

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.resolved_at).toBeInstanceOf(Date);
      expect(updateCall.resolved_at.getTime()).toBeGreaterThanOrEqual(beforeResolve.getTime());
    });
  });

  describe('delete', () => {
    it('should delete alert and return true on success', async () => {
      mockQueryBuilder.del.mockResolvedValue(1);

      const result = await alertModel.delete('alert-123');

      expect(mockDb).toHaveBeenCalledWith('alerts');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'alert-123' });
      expect(mockQueryBuilder.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when alert not found', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const result = await alertModel.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows affected', async () => {
      mockQueryBuilder.del.mockResolvedValue(2);

      const result = await alertModel.delete('alert-123');

      expect(result).toBe(true);
    });
  });

  describe('table name', () => {
    it('should use alerts table for all operations', async () => {
      mockQueryBuilder.returning.mockResolvedValue([createMockAlert()]);
      mockQueryBuilder.first.mockResolvedValue(createMockAlert());
      mockQueryBuilder.del.mockResolvedValue(1);
      mockQueryBuilder.update.mockResolvedValue(1);
      mockQueryBuilder.orderBy
        .mockReturnValueOnce(mockQueryBuilder)
        .mockResolvedValueOnce([]);

      await alertModel.create(createMockAlert());
      expect(mockDb).toHaveBeenLastCalledWith('alerts');

      await alertModel.findById('123');
      expect(mockDb).toHaveBeenLastCalledWith('alerts');

      await alertModel.findUnresolved();
      expect(mockDb).toHaveBeenLastCalledWith('alerts');

      await alertModel.resolve('123');
      expect(mockDb).toHaveBeenLastCalledWith('alerts');

      await alertModel.delete('123');
      expect(mockDb).toHaveBeenLastCalledWith('alerts');
    });
  });
});
