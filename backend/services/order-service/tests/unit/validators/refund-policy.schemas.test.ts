import {
  policyParamSchema,
  ruleParamSchema,
  policyRuleParamSchema,
  reasonParamSchema,
  createPolicySchema,
  updatePolicySchema,
  createRuleSchema,
  updateRuleSchema,
  createReasonSchema,
  updateReasonSchema,
  checkEligibilitySchema,
  listPoliciesQuerySchema,
  listReasonsQuerySchema,
} from '../../../src/validators/refund-policy.schemas';

describe('Refund Policy Schemas', () => {
  const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  describe('Parameter Schemas', () => {
    describe('policyParamSchema', () => {
      it('should validate valid policy ID', () => {
        const { error } = policyParamSchema.validate({ policyId: validUuid });
        expect(error).toBeUndefined();
      });

      it('should require policyId', () => {
        const { error } = policyParamSchema.validate({});
        expect(error).toBeDefined();
        expect(error?.message).toContain('"policyId" is required');
      });

      it('should reject invalid UUID format', () => {
        const { error } = policyParamSchema.validate({ policyId: 'not-a-uuid' });
        expect(error).toBeDefined();
        expect(error?.message).toContain('fails to match the required pattern');
      });

      it('should reject unknown fields', () => {
        const { error } = policyParamSchema.validate({ policyId: validUuid, extra: 'field' });
        expect(error).toBeDefined();
        expect(error?.message).toContain('not allowed');
      });
    });

    describe('ruleParamSchema', () => {
      it('should validate valid rule ID', () => {
        const { error } = ruleParamSchema.validate({ ruleId: validUuid });
        expect(error).toBeUndefined();
      });

      it('should require ruleId', () => {
        const { error } = ruleParamSchema.validate({});
        expect(error).toBeDefined();
        expect(error?.message).toContain('"ruleId" is required');
      });
    });

    describe('reasonParamSchema', () => {
      it('should validate valid reason ID', () => {
        const { error } = reasonParamSchema.validate({ reasonId: validUuid });
        expect(error).toBeUndefined();
      });

      it('should require reasonId', () => {
        const { error } = reasonParamSchema.validate({});
        expect(error).toBeDefined();
        expect(error?.message).toContain('"reasonId" is required');
      });
    });
  });

  describe('createPolicySchema', () => {
    const validPolicy = {
      name: 'Standard Refund Policy',
      description: 'Standard policy for all events',
      eventTypes: ['CONCERT', 'SPORTS'],
      isDefault: false,
      isActive: true,
      priority: 10,
    };

    it('should validate valid policy', () => {
      const { error } = createPolicySchema.validate(validPolicy);
      expect(error).toBeUndefined();
    });

    it('should require name', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, name: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"name" is required');
    });

    it('should enforce minimum name length', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, name: '' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be at least 1');
    });

    it('should enforce maximum name length', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, name: 'a'.repeat(101) });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 100');
    });

    it('should accept null description', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, description: null });
      expect(error).toBeUndefined();
    });

    it('should enforce maximum description length', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, description: 'a'.repeat(501) });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 500');
    });

    it('should default isDefault to false', () => {
      const { error, value } = createPolicySchema.validate({ name: 'Test Policy' });
      expect(error).toBeUndefined();
      expect(value.isDefault).toBe(false);
    });

    it('should default isActive to true', () => {
      const { error, value } = createPolicySchema.validate({ name: 'Test Policy' });
      expect(error).toBeUndefined();
      expect(value.isActive).toBe(true);
    });

    it('should default priority to 0', () => {
      const { error, value } = createPolicySchema.validate({ name: 'Test Policy' });
      expect(error).toBeUndefined();
      expect(value.priority).toBe(0);
    });

    it('should enforce priority range', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, priority: 1001 });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 1000');
    });

    it('should accept ISO date for effectiveFrom', () => {
      const { error } = createPolicySchema.validate({ 
        ...validPolicy, 
        effectiveFrom: '2024-01-01T00:00:00.000Z' 
      });
      expect(error).toBeUndefined();
    });

    it('should reject unknown fields', () => {
      const { error } = createPolicySchema.validate({ ...validPolicy, unknown: 'field' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('not allowed');
    });
  });

  describe('updatePolicySchema', () => {
    it('should accept partial updates', () => {
      const { error } = updatePolicySchema.validate({ name: 'Updated Name' });
      expect(error).toBeUndefined();
    });

    it('should accept empty object', () => {
      const { error } = updatePolicySchema.validate({});
      expect(error).toBeUndefined();
    });

    it('should reject unknown fields', () => {
      const { error } = updatePolicySchema.validate({ unknown: 'field' });
      expect(error).toBeDefined();
    });
  });

  describe('createRuleSchema', () => {
    const validRule = {
      policyId: validUuid,
      name: 'Full Refund 48h Before',
      ruleType: 'TIME_BASED',
      conditionType: 'HOURS_BEFORE_EVENT',
      conditionValue: 48,
      refundPercentage: 100,
      isActive: true,
      priority: 10,
    };

    it('should validate valid rule', () => {
      const { error } = createRuleSchema.validate(validRule);
      expect(error).toBeUndefined();
    });

    it('should require policyId', () => {
      const { error } = createRuleSchema.validate({ ...validRule, policyId: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"policyId" is required');
    });

    it('should require name', () => {
      const { error } = createRuleSchema.validate({ ...validRule, name: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"name" is required');
    });

    it('should require ruleType', () => {
      const { error } = createRuleSchema.validate({ ...validRule, ruleType: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"ruleType" is required');
    });

    it('should accept valid ruleTypes', () => {
      const types = ['TIME_BASED', 'PERCENTAGE', 'TIERED', 'FLAT_FEE', 'EVENT_STATUS', 'TICKET_TYPE'];
      types.forEach(ruleType => {
        const { error } = createRuleSchema.validate({ ...validRule, ruleType });
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid ruleType', () => {
      const { error } = createRuleSchema.validate({ ...validRule, ruleType: 'INVALID' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be one of');
    });

    it('should require conditionType', () => {
      const { error } = createRuleSchema.validate({ ...validRule, conditionType: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"conditionType" is required');
    });

    it('should accept valid conditionTypes', () => {
      const types = [
        'HOURS_BEFORE_EVENT',
        'DAYS_BEFORE_EVENT',
        'EVENT_CANCELLED',
        'EVENT_POSTPONED',
        'EVENT_RESCHEDULED',
        'ALWAYS'
      ];
      types.forEach(conditionType => {
        const { error } = createRuleSchema.validate({ ...validRule, conditionType });
        expect(error).toBeUndefined();
      });
    });

    it('should enforce refundPercentage range', () => {
      const { error } = createRuleSchema.validate({ ...validRule, refundPercentage: 101 });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 100');
    });

    it('should accept null conditionValue', () => {
      const { error } = createRuleSchema.validate({ ...validRule, conditionValue: null });
      expect(error).toBeUndefined();
    });

    it('should accept tierValues', () => {
      const { error } = createRuleSchema.validate({
        ...validRule,
        tierValues: [
          { minHours: 0, maxHours: 24, percentage: 50 },
          { minHours: 24, maxHours: 48, percentage: 75 },
        ],
      });
      expect(error).toBeUndefined();
    });

    it('should validate tierValues structure', () => {
      const { error } = createRuleSchema.validate({
        ...validRule,
        tierValues: [
          { minHours: 0, percentage: 50 }, // missing required fields is ok if maxHours is optional
        ],
      });
      expect(error).toBeUndefined();
    });

    it('should reject unknown fields in tierValues', () => {
      const { error } = createRuleSchema.validate({
        ...validRule,
        tierValues: [
          { minHours: 0, maxHours: 24, percentage: 50, extra: 'field' },
        ],
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('not allowed');
    });

    it('should default isActive to true', () => {
      const { error, value } = createRuleSchema.validate({
        policyId: validUuid,
        name: 'Test',
        ruleType: 'PERCENTAGE',
        conditionType: 'ALWAYS',
      });
      expect(error).toBeUndefined();
      expect(value.isActive).toBe(true);
    });

    it('should default priority to 0', () => {
      const { error, value } = createRuleSchema.validate({
        policyId: validUuid,
        name: 'Test',
        ruleType: 'PERCENTAGE',
        conditionType: 'ALWAYS',
      });
      expect(error).toBeUndefined();
      expect(value.priority).toBe(0);
    });
  });

  describe('updateRuleSchema', () => {
    it('should accept partial updates', () => {
      const { error } = updateRuleSchema.validate({ name: 'Updated Name' });
      expect(error).toBeUndefined();
    });

    it('should accept empty object', () => {
      const { error } = updateRuleSchema.validate({});
      expect(error).toBeUndefined();
    });
  });

  describe('createReasonSchema', () => {
    const validReason = {
      code: 'EVENT_CANCELLED',
      name: 'Event Cancelled',
      description: 'The event was cancelled by the organizer',
      requiresEvidence: false,
      isUserSelectable: true,
      isActive: true,
      displayOrder: 10,
    };

    it('should validate valid reason', () => {
      const { error } = createReasonSchema.validate(validReason);
      expect(error).toBeUndefined();
    });

    it('should require code', () => {
      const { error } = createReasonSchema.validate({ ...validReason, code: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"code" is required');
    });

    it('should enforce code pattern (uppercase, numbers, underscores)', () => {
      const { error } = createReasonSchema.validate({ ...validReason, code: 'invalid-code' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be uppercase letters, numbers, and underscores only');
    });

    it('should accept valid code patterns', () => {
      const codes = ['EVENT_CANCELLED', 'USER_REQUEST', 'DUPLICATE_123', 'CODE_WITH_NUMBERS_999'];
      codes.forEach(code => {
        const { error } = createReasonSchema.validate({ ...validReason, code });
        expect(error).toBeUndefined();
      });
    });

    it('should require name', () => {
      const { error } = createReasonSchema.validate({ ...validReason, name: undefined });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"name" is required');
    });

    it('should accept valid evidenceTypes', () => {
      const { error } = createReasonSchema.validate({
        ...validReason,
        evidenceTypes: ['SCREENSHOT', 'EMAIL', 'DOCUMENT', 'PHOTO', 'OTHER'],
      });
      expect(error).toBeUndefined();
    });

    it('should reject invalid evidenceTypes', () => {
      const { error } = createReasonSchema.validate({
        ...validReason,
        evidenceTypes: ['INVALID_TYPE'],
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be one of');
    });

    it('should default requiresEvidence to false', () => {
      const { error, value } = createReasonSchema.validate({ code: 'TEST', name: 'Test' });
      expect(error).toBeUndefined();
      expect(value.requiresEvidence).toBe(false);
    });

    it('should default isUserSelectable to true', () => {
      const { error, value } = createReasonSchema.validate({ code: 'TEST', name: 'Test' });
      expect(error).toBeUndefined();
      expect(value.isUserSelectable).toBe(true);
    });

    it('should default isActive to true', () => {
      const { error, value } = createReasonSchema.validate({ code: 'TEST', name: 'Test' });
      expect(error).toBeUndefined();
      expect(value.isActive).toBe(true);
    });

    it('should default displayOrder to 0', () => {
      const { error, value } = createReasonSchema.validate({ code: 'TEST', name: 'Test' });
      expect(error).toBeUndefined();
      expect(value.displayOrder).toBe(0);
    });

    it('should enforce displayOrder range', () => {
      const { error } = createReasonSchema.validate({ ...validReason, displayOrder: 1001 });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be less than or equal to 1000');
    });
  });

  describe('updateReasonSchema', () => {
    it('should accept partial updates', () => {
      const { error } = updateReasonSchema.validate({ name: 'Updated Name' });
      expect(error).toBeUndefined();
    });

    it('should enforce code pattern when provided', () => {
      const { error } = updateReasonSchema.validate({ code: 'invalid-code' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be uppercase letters, numbers, and underscores only');
    });
  });

  describe('checkEligibilitySchema', () => {
    it('should validate valid eligibility check', () => {
      const { error } = checkEligibilitySchema.validate({
        orderId: validUuid,
        reasonCode: 'EVENT_CANCELLED',
        requestedAmountCents: 5000,
      });
      expect(error).toBeUndefined();
    });

    it('should require orderId', () => {
      const { error } = checkEligibilitySchema.validate({ reasonCode: 'TEST' });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"orderId" is required');
    });

    it('should accept optional fields', () => {
      const { error } = checkEligibilitySchema.validate({ orderId: validUuid });
      expect(error).toBeUndefined();
    });

    it('should validate itemIds as UUIDs', () => {
      const { error } = checkEligibilitySchema.validate({
        orderId: validUuid,
        itemIds: [validUuid, 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22'],
      });
      expect(error).toBeUndefined();
    });

    it('should reject invalid UUID in itemIds', () => {
      const { error } = checkEligibilitySchema.validate({
        orderId: validUuid,
        itemIds: ['not-a-uuid'],
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('fails to match the required pattern');
    });

    it('should enforce minimum requestedAmountCents', () => {
      const { error } = checkEligibilitySchema.validate({
        orderId: validUuid,
        requestedAmountCents: 0,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be greater than or equal to 1');
    });
  });

  describe('Query Schemas', () => {
    describe('listPoliciesQuerySchema', () => {
      it('should validate valid query', () => {
        const { error } = listPoliciesQuerySchema.validate({
          limit: 50,
          offset: 10,
          isActive: true,
        });
        expect(error).toBeUndefined();
      });

      it('should default limit to 20', () => {
        const { error, value } = listPoliciesQuerySchema.validate({});
        expect(error).toBeUndefined();
        expect(value.limit).toBe(20);
      });

      it('should default offset to 0', () => {
        const { error, value } = listPoliciesQuerySchema.validate({});
        expect(error).toBeUndefined();
        expect(value.offset).toBe(0);
      });

      it('should enforce maximum limit', () => {
        const { error } = listPoliciesQuerySchema.validate({ limit: 101 });
        expect(error).toBeDefined();
        expect(error?.message).toContain('must be less than or equal to 100');
      });

      it('should enforce minimum limit', () => {
        const { error } = listPoliciesQuerySchema.validate({ limit: 0 });
        expect(error).toBeDefined();
        expect(error?.message).toContain('must be greater than or equal to 1');
      });

      it('should reject unknown fields', () => {
        const { error } = listPoliciesQuerySchema.validate({ unknown: 'field' });
        expect(error).toBeDefined();
        expect(error?.message).toContain('not allowed');
      });
    });

    describe('listReasonsQuerySchema', () => {
      it('should validate valid query', () => {
        const { error } = listReasonsQuerySchema.validate({
          limit: 50,
          offset: 10,
          isActive: true,
          isUserSelectable: true,
        });
        expect(error).toBeUndefined();
      });

      it('should default limit to 20', () => {
        const { error, value } = listReasonsQuerySchema.validate({});
        expect(error).toBeUndefined();
        expect(value.limit).toBe(20);
      });

      it('should default offset to 0', () => {
        const { error, value } = listReasonsQuerySchema.validate({});
        expect(error).toBeUndefined();
        expect(value.offset).toBe(0);
      });
    });
  });
});
