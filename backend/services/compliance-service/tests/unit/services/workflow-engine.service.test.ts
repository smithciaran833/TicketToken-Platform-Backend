/**
 * Unit Tests for WorkflowEngineService
 *
 * Tests workflow creation, execution, step processing, and status management
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

jest.mock('../../../src/services/prometheus-metrics.service', () => ({
  prometheusMetrics: {
    incrementCounter: jest.fn(),
    observeHistogram: jest.fn()
  }
}));

// Import module under test AFTER mocks
import { WorkflowEngineService, workflowEngine, Workflow, WorkflowStep } from '../../../src/services/workflow-engine.service';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;

// =============================================================================
// TESTS
// =============================================================================

describe('WorkflowEngineService', () => {
  let service: WorkflowEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkflowEngineService();
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  // ===========================================================================
  // createWorkflow Tests
  // ===========================================================================

  describe('createWorkflow', () => {
    it('should create workflow with unique ID', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      expect(workflow.id).toMatch(/^wf_\d+_[a-z0-9]+$/);
    });

    it('should create workflow with pending status', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      expect(workflow.status).toBe('pending');
    });

    it('should assign correct venue and tenant IDs', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      expect(workflow.venueId).toBe(TEST_VENUE_ID);
      expect(workflow.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should include metadata if provided', async () => {
      const metadata = { priority: 'high', initiatedBy: 'admin' };
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification',
        metadata
      );

      expect(workflow.metadata).toEqual(metadata);
    });

    it('should save workflow to database', async () => {
      await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO compliance_workflows'),
        expect.arrayContaining([
          expect.stringMatching(/^wf_/),
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'venue_verification',
          'pending'
        ])
      );
    });

    it('should log workflow creation', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Created workflow: ${workflow.id}`)
      );
    });

    describe('workflow steps by type', () => {
      it('should create venue_verification workflow with correct steps', async () => {
        const workflow = await service.createWorkflow(
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'venue_verification'
        );

        expect(workflow.steps).toHaveLength(6);
        expect(workflow.steps.map(s => s.id)).toEqual([
          'verify_business',
          'upload_w9',
          'ofac_screening',
          'risk_assessment',
          'final_approval',
          'notify_venue'
        ]);
      });

      it('should create tax_year_end workflow with correct steps', async () => {
        const workflow = await service.createWorkflow(
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'tax_year_end'
        );

        expect(workflow.steps).toHaveLength(3);
        expect(workflow.steps.map(s => s.id)).toEqual([
          'collect_tax_data',
          'generate_1099',
          'notify_venues'
        ]);
      });

      it('should create compliance_review workflow with correct steps', async () => {
        const workflow = await service.createWorkflow(
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'compliance_review'
        );

        expect(workflow.steps).toHaveLength(3);
        expect(workflow.steps.map(s => s.id)).toEqual([
          'review_documents',
          'assess_compliance',
          'approval'
        ]);
      });

      it('should create document_renewal workflow with correct steps', async () => {
        const workflow = await service.createWorkflow(
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'document_renewal'
        );

        expect(workflow.steps).toHaveLength(2);
        expect(workflow.steps.map(s => s.id)).toEqual([
          'check_expiry',
          'request_renewal'
        ]);
      });

      it('should set all steps to pending status', async () => {
        const workflow = await service.createWorkflow(
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'venue_verification'
        );

        workflow.steps.forEach(step => {
          expect(step.status).toBe('pending');
        });
      });

      it('should set correct step dependencies', async () => {
        const workflow = await service.createWorkflow(
          TEST_VENUE_ID,
          TEST_TENANT_ID,
          'venue_verification'
        );

        const verifyBusinessStep = workflow.steps.find(s => s.id === 'verify_business');
        const uploadW9Step = workflow.steps.find(s => s.id === 'upload_w9');
        const finalApprovalStep = workflow.steps.find(s => s.id === 'final_approval');

        expect(verifyBusinessStep?.dependencies).toEqual([]);
        expect(uploadW9Step?.dependencies).toEqual(['verify_business']);
        expect(finalApprovalStep?.dependencies).toEqual(['upload_w9', 'risk_assessment']);
      });
    });
  });

  // ===========================================================================
  // startWorkflow Tests
  // ===========================================================================

  describe('startWorkflow', () => {
    it('should throw error if workflow not found', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await expect(service.startWorkflow('wf_nonexistent'))
        .rejects.toThrow('Workflow not found: wf_nonexistent');
    });

    it('should update workflow status to in_progress', async () => {
      // Create workflow first
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      await service.startWorkflow(workflow.id);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE compliance_workflows SET status = $1'),
        ['in_progress', workflow.id]
      );
    });

    it('should log workflow start', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      await service.startWorkflow(workflow.id);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Started workflow: ${workflow.id}`)
      );
    });
  });

  // ===========================================================================
  // getWorkflow Tests
  // ===========================================================================

  describe('getWorkflow', () => {
    it('should return workflow from cache if exists', async () => {
      // Create workflow (adds to cache)
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      // Clear mock to verify no DB call
      mockDbQuery.mockClear();

      const retrieved = await service.getWorkflow(workflow.id);

      expect(retrieved).toEqual(workflow);
      // Should not query DB since it's in cache
      expect(mockDbQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM compliance_workflows'),
        expect.any(Array)
      );
    });

    it('should load workflow from database if not in cache', async () => {
      const workflowId = 'wf_db_workflow';
      const dbRow = {
        id: workflowId,
        venue_id: TEST_VENUE_ID,
        tenant_id: TEST_TENANT_ID,
        type: 'venue_verification',
        status: 'completed',
        steps: JSON.stringify([{ id: 'step1', status: 'completed' }]),
        current_step: 'step1',
        started_at: new Date(),
        completed_at: new Date(),
        metadata: JSON.stringify({ source: 'test' })
      };

      mockDbQuery.mockResolvedValueOnce({ rows: [dbRow] });

      const workflow = await service.getWorkflow(workflowId);

      expect(workflow).not.toBeNull();
      expect(workflow?.id).toBe(workflowId);
      expect(workflow?.status).toBe('completed');
      expect(workflow?.metadata).toEqual({ source: 'test' });
    });

    it('should return null if workflow not found', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const workflow = await service.getWorkflow('wf_nonexistent');

      expect(workflow).toBeNull();
    });

    it('should parse JSON fields correctly', async () => {
      const steps = [
        { id: 'step1', name: 'Test Step', status: 'pending' }
      ];
      const metadata = { key: 'value' };

      mockDbQuery.mockResolvedValueOnce({
        rows: [{
          id: 'wf_test',
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          type: 'venue_verification',
          status: 'pending',
          steps: JSON.stringify(steps),
          metadata: JSON.stringify(metadata)
        }]
      });

      const workflow = await service.getWorkflow('wf_test');

      expect(workflow?.steps).toEqual(steps);
      expect(workflow?.metadata).toEqual(metadata);
    });

    it('should handle null metadata gracefully', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{
          id: 'wf_test',
          venue_id: TEST_VENUE_ID,
          tenant_id: TEST_TENANT_ID,
          type: 'venue_verification',
          status: 'pending',
          steps: '[]',
          metadata: null
        }]
      });

      const workflow = await service.getWorkflow('wf_test');

      expect(workflow?.metadata).toEqual({});
    });
  });

  // ===========================================================================
  // cancelWorkflow Tests
  // ===========================================================================

  describe('cancelWorkflow', () => {
    it('should throw error if workflow not found', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await expect(service.cancelWorkflow('wf_nonexistent'))
        .rejects.toThrow('Workflow not found: wf_nonexistent');
    });

    it('should update workflow status to cancelled', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      await service.cancelWorkflow(workflow.id);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE compliance_workflows'),
        expect.arrayContaining(['cancelled'])
      );
    });

    it('should log workflow cancellation', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      await service.cancelWorkflow(workflow.id);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Workflow cancelled: ${workflow.id}`)
      );
    });
  });

  // ===========================================================================
  // getVenueWorkflows Tests
  // ===========================================================================

  describe('getVenueWorkflows', () => {
    it('should query workflows by venue and tenant', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getVenueWorkflows(TEST_VENUE_ID, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE venue_id = $1 AND tenant_id = $2'),
        [TEST_VENUE_ID, TEST_TENANT_ID]
      );
    });

    it('should return workflows ordered by created_at DESC', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getVenueWorkflows(TEST_VENUE_ID, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no workflows', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const workflows = await service.getVenueWorkflows(TEST_VENUE_ID, TEST_TENANT_ID);

      expect(workflows).toEqual([]);
    });

    it('should parse and return multiple workflows', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [
          {
            id: 'wf_1',
            venue_id: TEST_VENUE_ID,
            tenant_id: TEST_TENANT_ID,
            type: 'venue_verification',
            status: 'completed',
            steps: '[]',
            metadata: '{}'
          },
          {
            id: 'wf_2',
            venue_id: TEST_VENUE_ID,
            tenant_id: TEST_TENANT_ID,
            type: 'tax_year_end',
            status: 'pending',
            steps: '[]',
            metadata: '{}'
          }
        ]
      });

      const workflows = await service.getVenueWorkflows(TEST_VENUE_ID, TEST_TENANT_ID);

      expect(workflows).toHaveLength(2);
      expect(workflows[0].id).toBe('wf_1');
      expect(workflows[1].id).toBe('wf_2');
    });
  });

  // ===========================================================================
  // Step Type Coverage Tests
  // ===========================================================================

  describe('workflow step types', () => {
    it('should include verification step type', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      const verificationStep = workflow.steps.find(s => s.type === 'verification');
      expect(verificationStep).toBeDefined();
    });

    it('should include document_upload step type', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      const docStep = workflow.steps.find(s => s.type === 'document_upload');
      expect(docStep).toBeDefined();
      expect(docStep?.config.requiredDocuments).toContain('W9');
    });

    it('should include ofac_check step type', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      const ofacStep = workflow.steps.find(s => s.type === 'ofac_check');
      expect(ofacStep).toBeDefined();
    });

    it('should include risk_assessment step type with threshold', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      const riskStep = workflow.steps.find(s => s.type === 'risk_assessment');
      expect(riskStep).toBeDefined();
      expect(riskStep?.config.riskThreshold).toBe(70);
    });

    it('should include approval step type', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      const approvalStep = workflow.steps.find(s => s.type === 'approval');
      expect(approvalStep).toBeDefined();
    });

    it('should include notification step type', async () => {
      const workflow = await service.createWorkflow(
        TEST_VENUE_ID,
        TEST_TENANT_ID,
        'venue_verification'
      );

      const notifyStep = workflow.steps.find(s => s.type === 'notification');
      expect(notifyStep).toBeDefined();
      expect(notifyStep?.config.notificationType).toBe('verification_complete');
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('workflowEngine singleton', () => {
    it('should export a singleton instance', () => {
      expect(workflowEngine).toBeInstanceOf(WorkflowEngineService);
    });
  });
});
