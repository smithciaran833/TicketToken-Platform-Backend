/**
 * Unit Tests for initializeTables
 *
 * Tests database table creation, indexes, and default settings
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

// Mock console
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Import module under test AFTER mocks
import { initializeTables } from '../../../src/services/init-tables';

// =============================================================================
// TESTS
// =============================================================================

describe('initializeTables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  // ===========================================================================
  // Table Creation Tests
  // ===========================================================================

  describe('table creation', () => {
    it('should create venue_verifications table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS venue_verifications')
      );
    });

    it('should create tax_records table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS tax_records')
      );
    });

    it('should create ofac_checks table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS ofac_checks')
      );
    });

    it('should create risk_assessments table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS risk_assessments')
      );
    });

    it('should create risk_flags table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS risk_flags')
      );
    });

    it('should create compliance_documents table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS compliance_documents')
      );
    });

    it('should create bank_verifications table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS bank_verifications')
      );
    });

    it('should create payout_methods table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS payout_methods')
      );
    });

    it('should create notification_log table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS notification_log')
      );
    });

    it('should create compliance_settings table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS compliance_settings')
      );
    });

    it('should create compliance_batch_jobs table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS compliance_batch_jobs')
      );
    });

    it('should create form_1099_records table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS form_1099_records')
      );
    });

    it('should create webhook_logs table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS webhook_logs')
      );
    });

    it('should create ofac_sdn_list table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS ofac_sdn_list')
      );
    });

    it('should create compliance_audit_log table', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS compliance_audit_log')
      );
    });

    it('should create all 15 tables', async () => {
      await initializeTables();

      const createTableCalls = mockDbQuery.mock.calls.filter(call =>
        call[0].includes('CREATE TABLE IF NOT EXISTS')
      );

      expect(createTableCalls.length).toBe(15);
    });
  });

  // ===========================================================================
  // Table Schema Tests
  // ===========================================================================

  describe('table schemas', () => {
    it('should include tenant_id in venue_verifications if present', async () => {
      await initializeTables();

      const venueVerificationCall = mockDbQuery.mock.calls.find(call =>
        call[0].includes('CREATE TABLE IF NOT EXISTS venue_verifications')
      );

      // Check for common columns
      expect(venueVerificationCall[0]).toContain('venue_id VARCHAR');
      expect(venueVerificationCall[0]).toContain('ein VARCHAR');
      expect(venueVerificationCall[0]).toContain('status VARCHAR');
    });

    it('should include JSONB columns for complex data', async () => {
      await initializeTables();

      // risk_assessments has JSONB factors
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('factors JSONB')
      );

      // form_1099_records has JSONB form_data
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('form_data JSONB')
      );
    });

    it('should include timestamp columns with defaults', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      );
    });
  });

  // ===========================================================================
  // Index Creation Tests
  // ===========================================================================

  describe('index creation', () => {
    it('should create index on venue_verifications.venue_id', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_venue_verifications_venue_id ON venue_verifications(venue_id)'
      );
    });

    it('should create index on venue_verifications.status', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_venue_verifications_status ON venue_verifications(status)'
      );
    });

    it('should create index on tax_records.venue_id', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_tax_records_venue_id ON tax_records(venue_id)'
      );
    });

    it('should create index on tax_records.year', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_tax_records_year ON tax_records(year)'
      );
    });

    it('should create index on ofac_checks.venue_id', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_ofac_checks_venue_id ON ofac_checks(venue_id)'
      );
    });

    it('should create index on risk_flags.venue_id', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_risk_flags_venue_id ON risk_flags(venue_id)'
      );
    });

    it('should create index on compliance_documents.venue_id', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_compliance_documents_venue_id ON compliance_documents(venue_id)'
      );
    });

    it('should create composite index on audit_log entity', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON compliance_audit_log(entity_type, entity_id)'
      );
    });

    it('should create composite index on form_1099', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_form_1099_venue ON form_1099_records(venue_id, year)'
      );
    });

    it('should create index on webhook_logs.source', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source)'
      );
    });

    it('should create index on ofac_sdn_list.full_name', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        'CREATE INDEX IF NOT EXISTS idx_ofac_sdn_name ON ofac_sdn_list(full_name)'
      );
    });

    it('should create all 11 indexes', async () => {
      await initializeTables();

      const indexCalls = mockDbQuery.mock.calls.filter(call =>
        call[0].includes('CREATE INDEX IF NOT EXISTS')
      );

      expect(indexCalls.length).toBe(11);
    });

    it('should handle "already exists" errors gracefully', async () => {
      const alreadyExistsError = new Error('relation "idx_test" already exists');
      mockDbQuery.mockImplementation((query) => {
        if (query.includes('CREATE INDEX')) {
          return Promise.reject(alreadyExistsError);
        }
        return Promise.resolve({ rows: [] });
      });

      // Should not throw
      await expect(initializeTables()).resolves.toBeUndefined();
    });

    it('should log non-already-exists index errors', async () => {
      const otherError = new Error('permission denied');
      let indexCallCount = 0;

      mockDbQuery.mockImplementation((query) => {
        if (query.includes('CREATE INDEX')) {
          indexCallCount++;
          if (indexCallCount === 1) {
            return Promise.reject(otherError);
          }
        }
        return Promise.resolve({ rows: [] });
      });

      await initializeTables();

      expect(console.error).toHaveBeenCalledWith(
        'Index creation error:',
        'permission denied'
      );
    });
  });

  // ===========================================================================
  // Default Settings Tests
  // ===========================================================================

  describe('default settings', () => {
    it('should insert default compliance settings', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO compliance_settings')
      );
    });

    it('should insert tax_threshold setting', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("'tax_threshold', '600'")
      );
    });

    it('should insert high_risk_score setting', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("'high_risk_score', '70'")
      );
    });

    it('should insert review_required_score setting', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("'review_required_score', '50'")
      );
    });

    it('should insert ofac_update_enabled setting', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("'ofac_update_enabled', 'true'")
      );
    });

    it('should insert auto_approve_low_risk setting', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("'auto_approve_low_risk', 'false'")
      );
    });

    it('should use ON CONFLICT DO NOTHING for settings', async () => {
      await initializeTables();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (key) DO NOTHING')
      );
    });
  });

  // ===========================================================================
  // Success/Error Logging Tests
  // ===========================================================================

  describe('logging', () => {
    it('should log success message on completion', async () => {
      await initializeTables();

      expect(console.log).toHaveBeenCalledWith(
        '✅ All compliance tables and indexes created'
      );
    });

    it('should log error and not throw on table creation failure', async () => {
      const dbError = new Error('Database connection failed');
      mockDbQuery.mockRejectedValue(dbError);

      // Should not throw
      await expect(initializeTables()).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(
        '❌ Failed to initialize tables:',
        dbError
      );
    });
  });

  // ===========================================================================
  // Execution Order Tests
  // ===========================================================================

  describe('execution order', () => {
    it('should create tables before indexes', async () => {
      const callOrder: string[] = [];

      mockDbQuery.mockImplementation((query) => {
        if (query.includes('CREATE TABLE')) {
          callOrder.push('table');
        } else if (query.includes('CREATE INDEX')) {
          callOrder.push('index');
        } else if (query.includes('INSERT INTO compliance_settings')) {
          callOrder.push('settings');
        }
        return Promise.resolve({ rows: [] });
      });

      await initializeTables();

      // All tables should come before indexes
      const firstIndexPos = callOrder.indexOf('index');
      const lastTablePos = callOrder.lastIndexOf('table');

      expect(lastTablePos).toBeLessThan(firstIndexPos);
    });

    it('should insert settings after creating tables', async () => {
      const callOrder: string[] = [];

      mockDbQuery.mockImplementation((query) => {
        if (query.includes('CREATE TABLE')) {
          callOrder.push('table');
        } else if (query.includes('INSERT INTO compliance_settings')) {
          callOrder.push('settings');
        }
        return Promise.resolve({ rows: [] });
      });

      await initializeTables();

      const settingsPos = callOrder.indexOf('settings');
      const lastTablePos = callOrder.lastIndexOf('table');

      expect(lastTablePos).toBeLessThan(settingsPos);
    });
  });
});
