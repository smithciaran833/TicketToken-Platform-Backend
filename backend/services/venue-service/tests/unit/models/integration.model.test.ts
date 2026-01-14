/**
 * Unit tests for IntegrationModel
 * Tests integration CRUD with credential mapping
 * Note: Uses is_active for soft delete, findById does NOT filter by is_active
 */

import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';
import { IntegrationModel, IIntegration } from '../../../src/models/integration.model';

describe('IntegrationModel', () => {
  let mockKnex: any;
  let integrationModel: IntegrationModel;

  const sampleIntegration: IIntegration = {
    id: 'integ-123',
    venue_id: 'venue-456',
    integration_type: 'stripe',
    integration_name: 'Stripe Integration',
    config_data: { environment: 'production' },
    is_active: true,
    api_key_encrypted: 'encrypted_api_key',
    api_secret_encrypted: 'encrypted_api_secret',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  beforeEach(() => {
    mockKnex = createKnexMock();
    integrationModel = new IntegrationModel(mockKnex);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with venue_integrations table name', () => {
      expect((integrationModel as any).tableName).toBe('venue_integrations');
    });
  });

  describe('findById (overridden - no is_active filter)', () => {
    it('should find integration by id without is_active filter', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleIntegration);

      const result = await integrationModel.findById('integ-123');

      expect(mockKnex).toHaveBeenCalledWith('venue_integrations');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'integ-123' });
      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['*']);
      expect(result).toEqual(sampleIntegration);
    });

    it('should find inactive integration (not filtered by is_active)', async () => {
      const inactiveIntegration = { ...sampleIntegration, is_active: false };
      mockKnex._mockChain.first.mockResolvedValue(inactiveIntegration);

      const result = await integrationModel.findById('integ-123');

      expect(result?.is_active).toBe(false);
    });

    it('should find integration with specific columns', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ id: 'integ-123', integration_type: 'stripe' });

      await integrationModel.findById('integ-123', ['id', 'integration_type']);

      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['id', 'integration_type']);
    });

    it('should return null when integration not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await integrationModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update (overridden)', () => {
    it('should update integration and map config', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{
        ...sampleIntegration,
        config_data: { environment: 'staging' },
      }]);

      const result = await integrationModel.update('integ-123', {
        config: { environment: 'staging' },
      });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'integ-123' });
      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.config_data).toEqual({ environment: 'staging' });
      expect(result.config_data).toEqual({ environment: 'staging' });
    });

    it('should map config_data field directly', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.update('integ-123', {
        config_data: { newSetting: 'value' },
      });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.config_data).toEqual({ newSetting: 'value' });
    });

    it('should map status to is_active', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleIntegration, is_active: true }]);

      await integrationModel.update('integ-123', { status: 'active' });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.is_active).toBe(true);
    });

    it('should map status inactive to is_active false', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleIntegration, is_active: false }]);

      await integrationModel.update('integ-123', { status: 'inactive' });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.is_active).toBe(false);
    });

    it('should map is_active directly', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleIntegration, is_active: false }]);

      await integrationModel.update('integ-123', { is_active: false });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.is_active).toBe(false);
    });

    it('should set updated_at timestamp', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.update('integ-123', { config: {} });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('delete (overridden - uses is_active)', () => {
    it('should soft delete by setting is_active to false', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      await integrationModel.delete('integ-123');

      expect(mockKnex).toHaveBeenCalledWith('venue_integrations');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'integ-123' });
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        is_active: false,
        updated_at: expect.any(Date),
      }));
    });
  });

  describe('findByVenue', () => {
    it('should find active integrations for venue', async () => {
      configureMockReturn(mockKnex, [sampleIntegration]);

      const result = await integrationModel.findByVenue('venue-456');

      expect(mockKnex).toHaveBeenCalledWith('venue_integrations');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456' });
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ is_active: true });
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no integrations', async () => {
      configureMockReturn(mockKnex, []);

      const result = await integrationModel.findByVenue('venue-999');

      expect(result).toEqual([]);
    });
  });

  describe('findByVenueAndType', () => {
    it('should find active integration by venue and type', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleIntegration);

      const result = await integrationModel.findByVenueAndType('venue-456', 'stripe');

      expect(mockKnex).toHaveBeenCalledWith('venue_integrations');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456', integration_type: 'stripe' });
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ is_active: true });
      expect(result).toEqual(sampleIntegration);
    });

    it('should return undefined when no matching integration', async () => {
      mockKnex._mockChain.first.mockResolvedValue(undefined);

      const result = await integrationModel.findByVenueAndType('venue-456', 'nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create integration with type mapping', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      const result = await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
        config: { environment: 'production' },
      });

      expect(mockKnex._mockChain.insert).toHaveBeenCalled();
      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.integration_type).toBe('stripe');
      expect(insertCall.config_data).toEqual({ environment: 'production' });
      expect(result).toEqual(sampleIntegration);
    });

    it('should create integration with integration_type field', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        integration_type: 'square',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.integration_type).toBe('square');
    });

    it('should map encrypted_credentials.apiKey to api_key_encrypted', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
        encrypted_credentials: {
          apiKey: 'encrypted_key_value',
          secretKey: 'encrypted_secret_value',
        },
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.api_key_encrypted).toBe('encrypted_key_value');
      expect(insertCall.api_secret_encrypted).toBe('encrypted_secret_value');
    });

    it('should use direct api_key_encrypted field', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
        api_key_encrypted: 'direct_key',
        api_secret_encrypted: 'direct_secret',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.api_key_encrypted).toBe('direct_key');
      expect(insertCall.api_secret_encrypted).toBe('direct_secret');
    });

    it('should auto-generate integration name', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'mailchimp',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.integration_name).toBe('mailchimp Integration');
    });

    it('should use provided integration name', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
        name: 'Custom Stripe Integration',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.integration_name).toBe('Custom Stripe Integration');
    });

    it('should default is_active to true', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_active).toBe(true);
    });

    it('should allow setting is_active to false', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ ...sampleIntegration, is_active: false }]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
        is_active: false,
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_active).toBe(false);
    });

    it('should default config_data to empty object', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleIntegration]);

      await integrationModel.create({
        venue_id: 'venue-456',
        type: 'stripe',
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.config_data).toEqual({});
    });
  });

  describe('withTransaction', () => {
    it('should create new instance with transaction', () => {
      const trxMock = createKnexMock();
      const transactionalModel = integrationModel.withTransaction(trxMock);

      expect(transactionalModel).toBeInstanceOf(IntegrationModel);
      expect((transactionalModel as any).db).toBe(trxMock);
    });
  });
});
