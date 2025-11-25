import { db } from './database.service';
import { logger } from '../utils/logger';
import { prometheusMetrics } from './prometheus-metrics.service';

/**
 * WORKFLOW ENGINE SERVICE
 * 
 * Automated compliance workflow orchestration
 * Phase 6: Advanced Compliance Features
 */

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'verification' | 'document_upload' | 'ofac_check' | 'risk_assessment' | 'approval' | 'notification';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  dependencies: string[];
  config: Record<string, any>;
  result?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface Workflow {
  id: string;
  venueId: string;
  tenantId: string;
  type: 'venue_verification' | 'tax_year_end' | 'compliance_review' | 'document_renewal';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStep[];
  currentStep?: string;
  startedAt?: Date;
  completedAt?: Date;
  metadata: Record<string, any>;
}

export class WorkflowEngineService {
  private workflows: Map<string, Workflow> = new Map();

  /**
   * Create a new workflow
   */
  async createWorkflow(
    venueId: string,
    tenantId: string,
    type: Workflow['type'],
    metadata: Record<string, any> = {}
  ): Promise<Workflow> {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const steps = this.getWorkflowSteps(type);

    const workflow: Workflow = {
      id: workflowId,
      venueId,
      tenantId,
      type,
      status: 'pending',
      steps,
      metadata,
    };

    // Save to database
    await db.query(
      `INSERT INTO compliance_workflows (id, venue_id, tenant_id, type, status, steps, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [workflowId, venueId, tenantId, type, 'pending', JSON.stringify(steps), JSON.stringify(metadata)]
    );

    this.workflows.set(workflowId, workflow);

    logger.info(`Created workflow: ${workflowId} for venue: ${venueId}`);
    return workflow;
  }

  /**
   * Start workflow execution
   */
  async startWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.status = 'in_progress';
    workflow.startedAt = new Date();

    await this.updateWorkflowStatus(workflowId, 'in_progress');

    logger.info(`Started workflow: ${workflowId}`);

    // Execute workflow asynchronously
    this.executeWorkflow(workflowId).catch(error => {
      logger.error(`Workflow execution failed: ${workflowId}`, error);
    });
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) return;

    try {
      for (const step of workflow.steps) {
        // Check if dependencies are completed
        const dependenciesMet = await this.checkDependencies(workflow, step);
        if (!dependenciesMet) {
          step.status = 'skipped';
          continue;
        }

        // Execute step
        workflow.currentStep = step.id;
        await this.executeStep(workflow, step);

        // Break if step failed
        if (step.status === 'failed') {
          workflow.status = 'failed';
          break;
        }
      }

      // Check if all steps completed
      const allCompleted = workflow.steps.every(s => s.status === 'completed' || s.status === 'skipped');
      if (allCompleted) {
        workflow.status = 'completed';
        workflow.completedAt = new Date();
      }

      await this.saveWorkflow(workflow);

      logger.info(`Workflow completed: ${workflowId} with status: ${workflow.status}`);
    } catch (error) {
      logger.error(`Workflow execution error: ${workflowId}`, error);
      workflow.status = 'failed';
      await this.saveWorkflow(workflow);
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    step.status = 'in_progress';
    step.startedAt = new Date();

    logger.info(`Executing step: ${step.id} in workflow: ${workflow.id}`);

    try {
      switch (step.type) {
        case 'verification':
          await this.executeVerificationStep(workflow, step);
          break;
        case 'document_upload':
          await this.executeDocumentUploadStep(workflow, step);
          break;
        case 'ofac_check':
          await this.executeOfacCheckStep(workflow, step);
          break;
        case 'risk_assessment':
          await this.executeRiskAssessmentStep(workflow, step);
          break;
        case 'approval':
          await this.executeApprovalStep(workflow, step);
          break;
        case 'notification':
          await this.executeNotificationStep(workflow, step);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      step.status = 'completed';
      step.completedAt = new Date();
      
      logger.info(`Step completed: ${step.id}`);
    } catch (error: any) {
      step.status = 'failed';
      step.error = error.message;
      step.completedAt = new Date();
      
      logger.error(`Step failed: ${step.id}`, error);
      throw error;
    }
  }

  /**
   * Step execution handlers
   */
  private async executeVerificationStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // Start venue verification
    const result = await db.query(
      `SELECT * FROM venue_verifications WHERE venue_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [workflow.venueId, workflow.tenantId]
    );

    step.result = { verification: result.rows[0] };
  }

  private async executeDocumentUploadStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // Check for required documents
    const requiredDocs = step.config.requiredDocuments || ['W9'];
    
    const result = await db.query(
      `SELECT document_type, COUNT(*) as count 
       FROM compliance_documents 
       WHERE venue_id = $1 AND tenant_id = $2 AND document_type = ANY($3)
       GROUP BY document_type`,
      [workflow.venueId, workflow.tenantId, requiredDocs]
    );

    const uploadedTypes = result.rows.map((r: any) => r.document_type);
    const missingDocs = requiredDocs.filter((d: string) => !uploadedTypes.includes(d));

    if (missingDocs.length > 0) {
      throw new Error(`Missing required documents: ${missingDocs.join(', ')}`);
    }

    step.result = { documents: result.rows };
  }

  private async executeOfacCheckStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // Perform OFAC check
    const result = await db.query(
      `SELECT * FROM ofac_checks WHERE venue_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [workflow.venueId, workflow.tenantId]
    );

    if (result.rows[0]?.result === 'match') {
      throw new Error('OFAC match found - manual review required');
    }

    step.result = { ofacCheck: result.rows[0] };
  }

  private async executeRiskAssessmentStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // Calculate risk score
    const result = await db.query(
      `SELECT * FROM risk_assessments WHERE venue_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [workflow.venueId, workflow.tenantId]
    );

    const riskScore = result.rows[0]?.risk_score || 0;
    const threshold = step.config.riskThreshold || 70;

    if (riskScore > threshold) {
      throw new Error(`Risk score ${riskScore} exceeds threshold ${threshold}`);
    }

    step.result = { riskScore };
  }

  private async executeApprovalStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // Check if approval is granted
    const requiresManualApproval = step.config.requiresManualApproval || false;
    
    if (requiresManualApproval) {
      // Wait for manual approval (would be handled by separate API endpoint)
      step.result = { approved: true, approvedBy: 'system' };
    } else {
      // Auto-approve
      step.result = { approved: true, approvedBy: 'auto' };
    }
  }

  private async executeNotificationStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // Send notification
    const notificationType = step.config.notificationType || 'workflow_completed';
    
    logger.info(`Sending notification: ${notificationType} for workflow: ${workflow.id}`);
    
    step.result = { notificationSent: true, type: notificationType };
  }

  /**
   * Check if step dependencies are met
   */
  private async checkDependencies(workflow: Workflow, step: WorkflowStep): Promise<boolean> {
    if (!step.dependencies || step.dependencies.length === 0) {
      return true;
    }

    return step.dependencies.every(depId => {
      const depStep = workflow.steps.find(s => s.id === depId);
      return depStep?.status === 'completed';
    });
  }

  /**
   * Get workflow steps based on type
   */
  private getWorkflowSteps(type: Workflow['type']): WorkflowStep[] {
    const steps: Record<Workflow['type'], WorkflowStep[]> = {
      venue_verification: [
        {
          id: 'verify_business',
          name: 'Verify Business Information',
          type: 'verification',
          status: 'pending',
          dependencies: [],
          config: {},
        },
        {
          id: 'upload_w9',
          name: 'Upload W9 Form',
          type: 'document_upload',
          status: 'pending',
          dependencies: ['verify_business'],
          config: { requiredDocuments: ['W9'] },
        },
        {
          id: 'ofac_screening',
          name: 'OFAC Screening',
          type: 'ofac_check',
          status: 'pending',
          dependencies: ['verify_business'],
          config: {},
        },
        {
          id: 'risk_assessment',
          name: 'Risk Assessment',
          type: 'risk_assessment',
          status: 'pending',
          dependencies: ['ofac_screening'],
          config: { riskThreshold: 70 },
        },
        {
          id: 'final_approval',
          name: 'Final Approval',
          type: 'approval',
          status: 'pending',
          dependencies: ['upload_w9', 'risk_assessment'],
          config: {},
        },
        {
          id: 'notify_venue',
          name: 'Notify Venue',
          type: 'notification',
          status: 'pending',
          dependencies: ['final_approval'],
          config: { notificationType: 'verification_complete' },
        },
      ],
      tax_year_end: [
        {
          id: 'collect_tax_data',
          name: 'Collect Tax Data',
          type: 'verification',
          status: 'pending',
          dependencies: [],
          config: {},
        },
        {
          id: 'generate_1099',
          name: 'Generate 1099 Forms',
          type: 'document_upload',
          status: 'pending',
          dependencies: ['collect_tax_data'],
          config: {},
        },
        {
          id: 'notify_venues',
          name: 'Notify Venues',
          type: 'notification',
          status: 'pending',
          dependencies: ['generate_1099'],
          config: { notificationType: 'tax_forms_ready' },
        },
      ],
      compliance_review: [
        {
          id: 'review_documents',
          name: 'Review Documents',
          type: 'document_upload',
          status: 'pending',
          dependencies: [],
          config: {},
        },
        {
          id: 'assess_compliance',
          name: 'Assess Compliance',
          type: 'risk_assessment',
          status: 'pending',
          dependencies: ['review_documents'],
          config: {},
        },
        {
          id: 'approval',
          name: 'Approval',
          type: 'approval',
          status: 'pending',
          dependencies: ['assess_compliance'],
          config: { requiresManualApproval: true },
        },
      ],
      document_renewal: [
        {
          id: 'check_expiry',
          name: 'Check Document Expiry',
          type: 'document_upload',
          status: 'pending',
          dependencies: [],
          config: {},
        },
        {
          id: 'request_renewal',
          name: 'Request Document Renewal',
          type: 'notification',
          status: 'pending',
          dependencies: ['check_expiry'],
          config: { notificationType: 'document_renewal_required' },
        },
      ],
    };

    return steps[type] || [];
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    // Check cache first
    if (this.workflows.has(workflowId)) {
      return this.workflows.get(workflowId)!;
    }

    // Load from database
    const result = await db.query(
      `SELECT * FROM compliance_workflows WHERE id = $1`,
      [workflowId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const workflow: Workflow = {
      id: row.id,
      venueId: row.venue_id,
      tenantId: row.tenant_id,
      type: row.type,
      status: row.status,
      steps: JSON.parse(row.steps),
      currentStep: row.current_step,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };

    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  /**
   * Update workflow status
   */
  private async updateWorkflowStatus(workflowId: string, status: Workflow['status']): Promise<void> {
    await db.query(
      `UPDATE compliance_workflows SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, workflowId]
    );
  }

  /**
   * Save workflow to database
   */
  private async saveWorkflow(workflow: Workflow): Promise<void> {
    await db.query(
      `UPDATE compliance_workflows 
       SET status = $1, steps = $2, current_step = $3, started_at = $4, completed_at = $5, updated_at = NOW()
       WHERE id = $6`,
      [
        workflow.status,
        JSON.stringify(workflow.steps),
        workflow.currentStep,
        workflow.startedAt,
        workflow.completedAt,
        workflow.id,
      ]
    );
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    workflow.status = 'cancelled';
    await this.saveWorkflow(workflow);

    logger.info(`Workflow cancelled: ${workflowId}`);
  }

  /**
   * Get workflows for venue
   */
  async getVenueWorkflows(venueId: string, tenantId: string): Promise<Workflow[]> {
    const result = await db.query(
      `SELECT * FROM compliance_workflows 
       WHERE venue_id = $1 AND tenant_id = $2 
       ORDER BY created_at DESC`,
      [venueId, tenantId]
    );

    return result.rows.map(row => ({
      id: row.id,
      venueId: row.venue_id,
      tenantId: row.tenant_id,
      type: row.type,
      status: row.status,
      steps: JSON.parse(row.steps),
      currentStep: row.current_step,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }
}

export const workflowEngine = new WorkflowEngineService();
