/**
 * Unit Tests for PCI Compliance Service
 */
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn()
  }
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PCIComplianceService, pciComplianceService } from '../../../src/services/pci-compliance.service';
import { db } from '../../../src/services/database.service';

describe('PCIComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logCardDataAccess', () => {
    it('should insert access log into database', async () => {
      await pciComplianceService.logCardDataAccess(
        'user-123',
        'VIEW',
        'Customer support request'
      );

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO pci_access_logs'),
        ['user-123', 'VIEW', 'Customer support request', 'system']
      );
    });

    it('should log different action types', async () => {
      await pciComplianceService.logCardDataAccess('user-1', 'CREATE', 'New card');
      await pciComplianceService.logCardDataAccess('user-2', 'DELETE', 'Card removal');
      await pciComplianceService.logCardDataAccess('user-3', 'UPDATE', 'Card update');

      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query).toHaveBeenNthCalledWith(1, expect.any(String), ['user-1', 'CREATE', 'New card', 'system']);
      expect(db.query).toHaveBeenNthCalledWith(2, expect.any(String), ['user-2', 'DELETE', 'Card removal', 'system']);
      expect(db.query).toHaveBeenNthCalledWith(3, expect.any(String), ['user-3', 'UPDATE', 'Card update', 'system']);
    });

    it('should use system as ip_address', async () => {
      await pciComplianceService.logCardDataAccess('user-123', 'VIEW', 'reason');

      const callArgs = (db.query as jest.Mock<any>).mock.calls[0][1];
      expect(callArgs[3]).toBe('system');
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('DB error'));

      await expect(pciComplianceService.logCardDataAccess('user', 'action', 'reason'))
        .rejects.toThrow('DB error');
    });
  });

  describe('validatePCICompliance', () => {
    it('should return compliant when all checks pass', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // No card data
        .mockResolvedValueOnce({ rows: [{ encryption: 'aes' }] }) // Encryption enabled
        .mockResolvedValueOnce({ rows: [{ ssl: 'on' }] }); // SSL enabled

      const result = await pciComplianceService.validatePCICompliance();

      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect card data in database', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Card data found!
        .mockResolvedValueOnce({ rows: [{ encryption: 'aes' }] })
        .mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });

      const result = await pciComplianceService.validatePCICompliance();

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('Card data found in database - must be removed');
    });

    it('should detect missing encryption', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ encryption: null }] }) // No encryption!
        .mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });

      const result = await pciComplianceService.validatePCICompliance();

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('Database encryption not enabled');
    });

    it('should detect missing SSL', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ encryption: 'aes' }] })
        .mockResolvedValueOnce({ rows: [{ ssl: 'off' }] }); // SSL off!

      const result = await pciComplianceService.validatePCICompliance();

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('SSL not enabled for database connections');
    });

    it('should detect multiple issues', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // Card data found
        .mockResolvedValueOnce({ rows: [{ encryption: '' }] }) // No encryption
        .mockResolvedValueOnce({ rows: [{ ssl: 'off' }] }); // SSL off

      const result = await pciComplianceService.validatePCICompliance();

      expect(result.compliant).toBe(false);
      expect(result.issues).toHaveLength(3);
      expect(result.issues).toContain('Card data found in database - must be removed');
      expect(result.issues).toContain('Database encryption not enabled');
      expect(result.issues).toContain('SSL not enabled for database connections');
    });

    it('should query for card column names', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ encryption: 'aes' }] })
        .mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });

      await pciComplianceService.validatePCICompliance();

      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('information_schema.columns')
      );
      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('%card%number%')
      );
      expect(db.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('%cvv%')
      );
    });

    it('should check encryption setting', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ encryption: 'aes' }] })
        .mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });

      await pciComplianceService.validatePCICompliance();

      expect(db.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining("current_setting('block_encryption_type')")
      );
    });

    it('should check SSL setting', async () => {
      (db.query as jest.Mock<any>)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ encryption: 'aes' }] })
        .mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });

      await pciComplianceService.validatePCICompliance();

      expect(db.query).toHaveBeenNthCalledWith(3,
        expect.stringContaining("current_setting('ssl')")
      );
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('Connection failed'));

      await expect(pciComplianceService.validatePCICompliance())
        .rejects.toThrow('Connection failed');
    });
  });

  describe('exported singleton', () => {
    it('should export pciComplianceService instance', () => {
      expect(pciComplianceService).toBeDefined();
      expect(pciComplianceService.logCardDataAccess).toBeInstanceOf(Function);
      expect(pciComplianceService.validatePCICompliance).toBeInstanceOf(Function);
    });
  });
});
