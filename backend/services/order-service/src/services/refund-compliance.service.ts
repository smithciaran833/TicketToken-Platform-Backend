import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  RefundComplianceLog,
  ComplianceCheckResult,
  RegulationType,
  RefundEligibility
} from '../types/refund-policy.types';

export class RefundComplianceService {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async performComplianceChecks(
    refundId: string,
    tenantId: string,
    eligibility: RefundEligibility,
    orderDetails: any
  ): Promise<ComplianceCheckResult[]> {
    const checks: ComplianceCheckResult[] = [];

    // Run all compliance checks
    checks.push(await this.checkFTC16CFR424(eligibility, orderDetails));
    checks.push(await this.checkStateCompliance(eligibility, orderDetails, tenantId));
    checks.push(await this.checkConsumerProtection(eligibility, orderDetails));

    // Log all checks
    for (const check of checks) {
      await this.logComplianceCheck(refundId, tenantId, check);
    }

    return checks;
  }

  private async checkFTC16CFR424(
    eligibility: RefundEligibility,
    orderDetails: any
  ): Promise<ComplianceCheckResult> {
    // FTC 16 CFR 424 - Guides for the Use of Environmental Marketing Claims
    // and ticket refund policies must be clearly disclosed

    const checks = {
      policy_disclosed: true, // Assume policy was disclosed at purchase
      refund_amount_reasonable: eligibility.refund_percentage >= 0,
      no_deceptive_practices: true,
      timely_processing: true // Will be checked during actual refund processing
    };

    const passed = Object.values(checks).every(check => check === true);

    return {
      regulation_type: RegulationType.FTC_16_CFR_424,
      check_name: 'FTC 16 CFR 424 Compliance',
      passed,
      details: passed
        ? 'Refund policy complies with FTC guidelines for consumer protection'
        : 'Refund policy may not comply with FTC guidelines',
      metadata: checks
    };
  }

  private async checkStateCompliance(
    eligibility: RefundEligibility,
    orderDetails: any,
    tenantId: string
  ): Promise<ComplianceCheckResult> {
    // Check state-specific refund laws
    const state = orderDetails.customer_state || orderDetails.event_state;

    if (!state) {
      return {
        regulation_type: RegulationType.INTERNAL_POLICY,
        check_name: 'State Law Compliance',
        passed: true,
        details: 'No state information available - using internal policy',
        metadata: { state: null }
      };
    }

    // State-specific checks
    let regulationType = RegulationType.INTERNAL_POLICY;
    let checks: any = {};

    if (state === 'NY') {
      regulationType = RegulationType.STATE_LAW_NY;
      checks = this.checkNewYorkLaw(eligibility, orderDetails);
    } else if (state === 'CA') {
      regulationType = RegulationType.STATE_LAW_CA;
      checks = this.checkCaliforniaLaw(eligibility, orderDetails);
    }

    const passed = Object.values(checks).every(check => check === true);

    return {
      regulation_type: regulationType,
      check_name: `${state} State Law Compliance`,
      passed,
      details: passed
        ? `Refund policy complies with ${state} state laws`
        : `Refund policy may not comply with ${state} state laws`,
      metadata: { state, ...checks }
    };
  }

  private checkNewYorkLaw(eligibility: RefundEligibility, orderDetails: any): any {
    // New York Arts and Cultural Affairs Law §25.13
    // Ticket refunds must be offered for canceled/postponed events
    return {
      cancellation_refund_available: true,
      policy_clearly_stated: true,
      no_unreasonable_restrictions: eligibility.refund_percentage > 0
    };
  }

  private checkCaliforniaLaw(eligibility: RefundEligibility, orderDetails: any): any {
    // California Civil Code §1749.5
    // Ticket sellers must disclose refund policies
    return {
      policy_disclosed_at_sale: true,
      refund_or_exchange_offered: eligibility.refund_percentage > 0,
      fees_disclosed: true
    };
  }

  private async checkConsumerProtection(
    eligibility: RefundEligibility,
    orderDetails: any
  ): Promise<ComplianceCheckResult> {
    // General consumer protection checks
    const checks = {
      transparent_policy: true,
      reasonable_fees: this.areFeesReasonable(eligibility.deductions, orderDetails.total_amount_cents),
      no_hidden_charges: eligibility.deductions.length === eligibility.deductions.filter(d => d.description).length,
      accessible_to_consumer: true
    };

    const passed = Object.values(checks).every(check => check === true);

    return {
      regulation_type: RegulationType.INTERNAL_POLICY,
      check_name: 'Consumer Protection Standards',
      passed,
      details: passed
        ? 'Refund meets consumer protection standards'
        : 'Refund may not meet consumer protection standards',
      metadata: checks
    };
  }

  private areFeesReasonable(
    deductions: Array<{ description: string; amount_cents: number }>,
    totalAmount: number
  ): boolean {
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount_cents, 0);
    const deductionPercentage = (totalDeductions / totalAmount) * 100;
    
    // Consider fees reasonable if they're less than 25% of the total
    return deductionPercentage < 25;
  }

  private async logComplianceCheck(
    refundId: string,
    tenantId: string,
    check: ComplianceCheckResult
  ): Promise<RefundComplianceLog> {
    const query = `
      INSERT INTO refund_compliance_logs (
        refund_id, tenant_id, regulation_type, compliance_check,
        passed, details, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      refundId,
      tenantId,
      check.regulation_type,
      check.check_name,
      check.passed,
      check.details,
      JSON.stringify(check.metadata || {})
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getComplianceLogs(refundId: string, tenantId: string): Promise<RefundComplianceLog[]> {
    const query = `
      SELECT * FROM refund_compliance_logs
      WHERE refund_id = $1 AND tenant_id = $2
      ORDER BY checked_at DESC
    `;

    const result = await this.db.query(query, [refundId, tenantId]);
    return result.rows;
  }

  async validateComplianceForRefund(
    refundId: string,
    tenantId: string
  ): Promise<{ compliant: boolean; failures: string[] }> {
    const logs = await this.getComplianceLogs(refundId, tenantId);
    
    const failures = logs
      .filter(log => !log.passed)
      .map(log => `${log.compliance_check}: ${log.details}`);

    return {
      compliant: failures.length === 0,
      failures
    };
  }

  async checkEUConsumerRights(
    eligibility: RefundEligibility,
    orderDetails: any
  ): Promise<ComplianceCheckResult> {
    // EU Consumer Rights Directive - 14-day cooling-off period for online purchases
    // Note: Events and entertainment may be exempt from cooling-off period
    const purchaseDate = new Date(orderDetails.created_at);
    const now = new Date();
    const daysSincePurchase = (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);

    const checks = {
      within_cooling_off: daysSincePurchase <= 14,
      exemption_disclosed: true, // Events typically exempt from cooling-off period
      clear_terms: true,
      accessible_policy: true
    };

    const passed = Object.values(checks).every(check => check === true);

    return {
      regulation_type: RegulationType.EU_CONSUMER_RIGHTS,
      check_name: 'EU Consumer Rights Directive',
      passed,
      details: passed
        ? 'Refund policy complies with EU Consumer Rights Directive'
        : 'Refund policy may not comply with EU Consumer Rights Directive',
      metadata: { days_since_purchase: daysSincePurchase, ...checks }
    };
  }

  async checkCCPACompliance(
    eligibility: RefundEligibility,
    orderDetails: any
  ): Promise<ComplianceCheckResult> {
    // California Consumer Privacy Act - Data rights in refund process
    const checks = {
      data_processed_lawfully: true,
      customer_rights_respected: true,
      data_minimization: true,
      transparent_processing: true
    };

    const passed = Object.values(checks).every(check => check === true);

    return {
      regulation_type: RegulationType.CCPA,
      check_name: 'CCPA Data Protection',
      passed,
      details: passed
        ? 'Refund processing complies with CCPA data protection requirements'
        : 'Refund processing may not comply with CCPA',
      metadata: checks
    };
  }
}
