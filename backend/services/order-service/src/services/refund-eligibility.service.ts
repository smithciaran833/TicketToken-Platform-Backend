import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  RefundEligibility,
  RefundEligibilityRequest,
  RefundPolicy,
  RefundPolicyRule,
  RefundRuleType,
  TimeBasedRuleConfig,
  PercentageRuleConfig,
  TieredRuleConfig,
  FlatFeeRuleConfig,
  ProRatedCalculation
} from '../types/refund-policy.types';
import { RefundPolicyService } from './refund-policy.service';

export class RefundEligibilityService {
  private db: Pool;
  private policyService: RefundPolicyService;

  constructor() {
    this.db = getDatabase();
    this.policyService = new RefundPolicyService();
  }

  async checkEligibility(request: RefundEligibilityRequest): Promise<RefundEligibility> {
    // Get order details
    const order = await this.getOrderDetails(request.order_id, request.tenant_id);
    if (!order) {
      return this.createIneligibleResponse('Order not found');
    }

    // Find applicable policy
    const policy = await this.policyService.getPolicyForOrder(
      request.tenant_id,
      order.event_type,
      order.ticket_type
    );

    if (!policy) {
      return this.createIneligibleResponse('No refund policy found for this order');
    }

    // Check refund window
    const eventDate = request.event_date || order.event_date;
    if (!this.isWithinRefundWindow(policy, eventDate)) {
      return this.createIneligibleResponse('Order is outside the refund window');
    }

    // Get policy rules
    const rules = await this.policyService.getRulesForPolicy(policy.id, request.tenant_id);
    if (rules.length === 0) {
      return this.createIneligibleResponse('No refund rules configured for this policy');
    }

    // Calculate refund amount
    const refundAmount = await this.calculateRefund(
      order,
      policy,
      rules,
      eventDate,
      request.requested_amount_cents
    );

    return {
      eligible: true,
      policy_id: policy.id,
      policy_name: policy.policy_name,
      refund_amount_cents: refundAmount.total,
      original_amount_cents: order.total_amount_cents,
      refund_percentage: (refundAmount.total / order.total_amount_cents) * 100,
      deductions: refundAmount.deductions,
      calculation_details: refundAmount.details
    };
  }

  private async getOrderDetails(orderId: string, tenantId: string): Promise<any> {
    const query = `
      SELECT 
        o.id,
        o.total_amount_cents,
        o.event_id,
        e.event_date,
        e.event_type,
        o.ticket_type
      FROM orders o
      LEFT JOIN events e ON o.event_id = e.id
      WHERE o.id = $1 AND o.tenant_id = $2
    `;

    const result = await this.db.query(query, [orderId, tenantId]);
    return result.rows[0] || null;
  }

  private isWithinRefundWindow(policy: RefundPolicy, eventDate: Date): boolean {
    const now = new Date();
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilEvent >= 0 && hoursUntilEvent <= policy.refund_window_hours;
  }

  private async calculateRefund(
    order: any,
    policy: RefundPolicy,
    rules: RefundPolicyRule[],
    eventDate: Date,
    requestedAmount?: number
  ): Promise<{
    total: number;
    deductions: Array<{ description: string; amount_cents: number }>;
    details: Record<string, any>;
  }> {
    let refundAmount = order.total_amount_cents;
    const deductions: Array<{ description: string; amount_cents: number }> = [];
    const details: Record<string, any> = {};

    // If partial refund requested, cap at that amount
    if (requestedAmount !== undefined) {
      refundAmount = Math.min(refundAmount, requestedAmount);
      details.requested_amount = requestedAmount;
    }

    // Apply pro-rating if enabled
    if (policy.pro_rated) {
      const proRated = this.calculateProRated(order, eventDate);
      refundAmount = Math.floor((refundAmount * proRated.refund_percentage) / 100);
      details.pro_rated = proRated;
    }

    // Apply rules in priority order
    for (const rule of rules) {
      const ruleResult = this.applyRule(rule, refundAmount, order, eventDate);
      refundAmount = ruleResult.amount;
      
      if (ruleResult.deduction) {
        deductions.push(ruleResult.deduction);
      }

      details[`rule_${rule.id}`] = ruleResult.details;
    }

    return {
      total: Math.max(0, refundAmount),
      deductions,
      details
    };
  }

  private calculateProRated(order: any, eventDate: Date): ProRatedCalculation {
    const now = new Date();
    const purchaseDate = new Date(order.created_at);
    
    const totalPeriodHours = (eventDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60);
    const elapsedHours = (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60);
    const remainingHours = Math.max(0, totalPeriodHours - elapsedHours);
    
    const usagePercentage = (elapsedHours / totalPeriodHours) * 100;
    const refundPercentage = Math.max(0, 100 - usagePercentage);

    return {
      total_period_hours: totalPeriodHours,
      elapsed_hours: elapsedHours,
      remaining_hours: remainingHours,
      usage_percentage: usagePercentage,
      refund_percentage: refundPercentage,
      refund_amount_cents: Math.floor((order.total_amount_cents * refundPercentage) / 100)
    };
  }

  private applyRule(
    rule: RefundPolicyRule,
    currentAmount: number,
    order: any,
    eventDate: Date
  ): {
    amount: number;
    deduction?: { description: string; amount_cents: number };
    details: Record<string, any>;
  } {
    switch (rule.rule_type) {
      case RefundRuleType.TIME_BASED:
        return this.applyTimeBasedRule(rule.rule_config as TimeBasedRuleConfig, currentAmount, eventDate);
      
      case RefundRuleType.PERCENTAGE:
        return this.applyPercentageRule(rule.rule_config as PercentageRuleConfig, currentAmount, order);
      
      case RefundRuleType.TIERED:
        return this.applyTieredRule(rule.rule_config as TieredRuleConfig, currentAmount);
      
      case RefundRuleType.FLAT_FEE:
        return this.applyFlatFeeRule(rule.rule_config as FlatFeeRuleConfig, currentAmount);
      
      case RefundRuleType.NO_REFUND:
        return {
          amount: 0,
          deduction: { description: 'No refund allowed', amount_cents: currentAmount },
          details: { rule_type: 'NO_REFUND' }
        };
      
      default:
        return { amount: currentAmount, details: {} };
    }
  }

  private applyTimeBasedRule(
    config: TimeBasedRuleConfig,
    currentAmount: number,
    eventDate: Date
  ): { amount: number; deduction?: { description: string; amount_cents: number }; details: Record<string, any> } {
    const now = new Date();
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Find applicable tier
    const applicableTier = config.tiers
      .sort((a, b) => a.hours_before_event - b.hours_before_event)
      .find(tier => hoursUntilEvent >= tier.hours_before_event);

    if (!applicableTier) {
      return {
        amount: 0,
        deduction: { description: 'Outside time-based refund window', amount_cents: currentAmount },
        details: { hours_until_event: hoursUntilEvent, applicable_tier: null }
      };
    }

    const refundAmount = Math.floor((currentAmount * applicableTier.refund_percentage) / 100);
    const deduction = currentAmount - refundAmount;

    return {
      amount: refundAmount,
      deduction: deduction > 0 ? {
        description: `Time-based deduction (${applicableTier.refund_percentage}% refund)`,
        amount_cents: deduction
      } : undefined,
      details: {
        hours_until_event: hoursUntilEvent,
        applicable_tier: applicableTier,
        refund_percentage: applicableTier.refund_percentage
      }
    };
  }

  private applyPercentageRule(
    config: PercentageRuleConfig,
    currentAmount: number,
    order: any
  ): { amount: number; deduction?: { description: string; amount_cents: number }; details: Record<string, any> } {
    let baseAmount = currentAmount;

    // Adjust base amount based on apply_to setting
    if (config.apply_to === 'TICKET_PRICE_ONLY') {
      baseAmount = order.ticket_price_cents || currentAmount;
    } else if (config.apply_to === 'EXCLUDING_FEES') {
      baseAmount = currentAmount - (order.fees_cents || 0);
    }

    const refundAmount = Math.floor((baseAmount * config.percentage) / 100);
    const deduction = currentAmount - refundAmount;

    return {
      amount: refundAmount,
      deduction: deduction > 0 ? {
        description: `Percentage-based deduction (${config.percentage}% refund)`,
        amount_cents: deduction
      } : undefined,
      details: {
        percentage: config.percentage,
        apply_to: config.apply_to,
        base_amount: baseAmount
      }
    };
  }

  private applyTieredRule(
    config: TieredRuleConfig,
    currentAmount: number
  ): { amount: number; deduction?: { description: string; amount_cents: number }; details: Record<string, any> } {
    // Find applicable tier based on order amount
    const applicableTier = config.tiers.find(tier => {
      const meetsMin = tier.min_amount_cents === undefined || currentAmount >= tier.min_amount_cents;
      const meetsMax = tier.max_amount_cents === undefined || currentAmount <= tier.max_amount_cents;
      return meetsMin && meetsMax;
    });

    if (!applicableTier) {
      return {
        amount: currentAmount,
        details: { applicable_tier: null, message: 'No applicable tier found' }
      };
    }

    const refundAmount = Math.floor((currentAmount * applicableTier.refund_percentage) / 100);
    const deduction = currentAmount - refundAmount;

    return {
      amount: refundAmount,
      deduction: deduction > 0 ? {
        description: `Tiered deduction (${applicableTier.refund_percentage}% refund)`,
        amount_cents: deduction
      } : undefined,
      details: {
        applicable_tier: applicableTier,
        refund_percentage: applicableTier.refund_percentage
      }
    };
  }

  private applyFlatFeeRule(
    config: FlatFeeRuleConfig,
    currentAmount: number
  ): { amount: number; deduction?: { description: string; amount_cents: number }; details: Record<string, any> } {
    if (config.deduct_from_refund) {
      const refundAmount = Math.max(0, currentAmount - config.fee_cents);
      return {
        amount: refundAmount,
        deduction: {
          description: 'Flat fee deduction',
          amount_cents: config.fee_cents
        },
        details: {
          fee_cents: config.fee_cents,
          deducted: true
        }
      };
    }

    return {
      amount: currentAmount,
      details: {
        fee_cents: config.fee_cents,
        deducted: false,
        note: 'Fee will be charged separately'
      }
    };
  }

  private createIneligibleResponse(reason: string): RefundEligibility {
    return {
      eligible: false,
      refund_amount_cents: 0,
      original_amount_cents: 0,
      refund_percentage: 0,
      deductions: [],
      reasons: [reason],
      calculation_details: {}
    };
  }
}
