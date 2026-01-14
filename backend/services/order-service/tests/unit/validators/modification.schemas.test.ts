import {
  modificationRequestSchema,
  upgradeRequestSchema,
  approveModificationSchema,
  rejectModificationSchema,
} from '../../../src/validators/modification.schemas';

describe('Modification Schemas', () => {
  const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  describe('modificationRequestSchema', () => {
    const validRequest = {
      modificationType: 'ADD_ITEM',
      originalItemId: validUuid,
      newTicketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
      quantityChange: 2,
      reason: 'Customer requested additional tickets',
      notes: 'Additional notes about the modification',
    };

    it('should validate a valid modification request', () => {
      const { error } = modificationRequestSchema.validate(validRequest);
      expect(error).toBeUndefined();
    });

    it('should require modificationType', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        modificationType: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"modificationType" is required');
    });

    it('should accept valid modification types', () => {
      const types = ['ADD_ITEM', 'REMOVE_ITEM', 'UPGRADE_ITEM', 'DOWNGRADE_ITEM', 'CHANGE_QUANTITY'];
      types.forEach((modificationType) => {
        const { error } = modificationRequestSchema.validate({
          ...validRequest,
          modificationType,
        });
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid modification type', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        modificationType: 'INVALID_TYPE',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be one of');
    });

    it('should accept optional originalItemId', () => {
      const requestWithoutOriginal = { ...validRequest };
      delete (requestWithoutOriginal as any).originalItemId;

      const { error } = modificationRequestSchema.validate(requestWithoutOriginal);
      expect(error).toBeUndefined();
    });

    it('should validate originalItemId as UUID', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        originalItemId: 'not-a-uuid',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should accept optional newTicketTypeId', () => {
      const requestWithoutNew = { ...validRequest };
      delete (requestWithoutNew as any).newTicketTypeId;

      const { error } = modificationRequestSchema.validate(requestWithoutNew);
      expect(error).toBeUndefined();
    });

    it('should validate newTicketTypeId as UUID', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        newTicketTypeId: 'not-a-uuid',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should accept optional quantityChange', () => {
      const requestWithoutQuantity = { ...validRequest };
      delete (requestWithoutQuantity as any).quantityChange;

      const { error } = modificationRequestSchema.validate(requestWithoutQuantity);
      expect(error).toBeUndefined();
    });

    it('should require quantityChange to be an integer', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        quantityChange: 2.5,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be an integer');
    });

    it('should accept negative quantityChange', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        quantityChange: -2,
      });
      expect(error).toBeUndefined();
    });

    it('should require reason', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        reason: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"reason" is required');
    });

    it('should enforce minimum reason length', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        reason: 'short',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be at least 10 characters');
    });

    it('should accept reason at minimum length', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        reason: 'a'.repeat(10),
      });
      expect(error).toBeUndefined();
    });

    it('should enforce maximum reason length', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        reason: 'a'.repeat(501),
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 500');
    });

    it('should accept reason at maximum length', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        reason: 'a'.repeat(500),
      });
      expect(error).toBeUndefined();
    });

    it('should accept optional notes', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        notes: 'Additional information',
      });
      expect(error).toBeUndefined();
    });

    it('should accept request without notes', () => {
      const requestWithoutNotes = { ...validRequest };
      delete (requestWithoutNotes as any).notes;

      const { error } = modificationRequestSchema.validate(requestWithoutNotes);
      expect(error).toBeUndefined();
    });

    it('should enforce maximum notes length', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        notes: 'a'.repeat(1001),
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 1000');
    });

    it('should accept notes at maximum length', () => {
      const { error } = modificationRequestSchema.validate({
        ...validRequest,
        notes: 'a'.repeat(1000),
      });
      expect(error).toBeUndefined();
    });

    it('should accept minimal valid request', () => {
      const { error } = modificationRequestSchema.validate({
        modificationType: 'ADD_ITEM',
        reason: 'Customer requested change to order',
      });
      expect(error).toBeUndefined();
    });
  });

  describe('upgradeRequestSchema', () => {
    const validUpgrade = {
      originalItemId: validUuid,
      newTicketTypeId: 'b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22',
      reason: 'Customer requested ticket upgrade',
      notes: 'Upgrade from standard to VIP',
    };

    it('should validate a valid upgrade request', () => {
      const { error } = upgradeRequestSchema.validate(validUpgrade);
      expect(error).toBeUndefined();
    });

    it('should require originalItemId', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        originalItemId: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"originalItemId" is required');
    });

    it('should validate originalItemId as UUID', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        originalItemId: 'not-a-uuid',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should require newTicketTypeId', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        newTicketTypeId: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"newTicketTypeId" is required');
    });

    it('should validate newTicketTypeId as UUID', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        newTicketTypeId: 'not-a-uuid',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should require reason', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        reason: undefined,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"reason" is required');
    });

    it('should enforce minimum reason length', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        reason: 'short',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be at least 10 characters');
    });

    it('should enforce maximum reason length', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        reason: 'a'.repeat(501),
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 500');
    });

    it('should accept optional notes', () => {
      const upgradeWithoutNotes = { ...validUpgrade };
      delete (upgradeWithoutNotes as any).notes;

      const { error } = upgradeRequestSchema.validate(upgradeWithoutNotes);
      expect(error).toBeUndefined();
    });

    it('should enforce maximum notes length', () => {
      const { error } = upgradeRequestSchema.validate({
        ...validUpgrade,
        notes: 'a'.repeat(1001),
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 1000');
    });
  });

  describe('approveModificationSchema', () => {
    it('should validate valid approval', () => {
      const { error } = approveModificationSchema.validate({
        modificationId: validUuid,
      });
      expect(error).toBeUndefined();
    });

    it('should require modificationId', () => {
      const { error } = approveModificationSchema.validate({});
      expect(error).toBeDefined();
      expect(error?.message).toContain('"modificationId" is required');
    });

    it('should validate modificationId as UUID', () => {
      const { error } = approveModificationSchema.validate({
        modificationId: 'not-a-uuid',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should reject empty modificationId', () => {
      const { error } = approveModificationSchema.validate({
        modificationId: '',
      });
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/must be a valid GUID|is not allowed to be empty/);
    });

    it('should reject null modificationId', () => {
      const { error } = approveModificationSchema.validate({
        modificationId: null,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a string');
    });
  });

  describe('rejectModificationSchema', () => {
    const validRejection = {
      modificationId: validUuid,
      reason: 'Modification cannot be processed at this time',
    };

    it('should validate valid rejection', () => {
      const { error } = rejectModificationSchema.validate(validRejection);
      expect(error).toBeUndefined();
    });

    it('should require modificationId', () => {
      const { error } = rejectModificationSchema.validate({
        reason: 'Cannot process',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"modificationId" is required');
    });

    it('should validate modificationId as UUID', () => {
      const { error } = rejectModificationSchema.validate({
        ...validRejection,
        modificationId: 'not-a-uuid',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('must be a valid GUID');
    });

    it('should require reason', () => {
      const { error } = rejectModificationSchema.validate({
        modificationId: validUuid,
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('"reason" is required');
    });

    it('should enforce minimum reason length', () => {
      const { error } = rejectModificationSchema.validate({
        ...validRejection,
        reason: 'short',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be at least 10 characters');
    });

    it('should accept reason at minimum length', () => {
      const { error } = rejectModificationSchema.validate({
        ...validRejection,
        reason: 'a'.repeat(10),
      });
      expect(error).toBeUndefined();
    });

    it('should enforce maximum reason length', () => {
      const { error } = rejectModificationSchema.validate({
        ...validRejection,
        reason: 'a'.repeat(501),
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('length must be less than or equal to 500');
    });

    it('should accept reason at maximum length', () => {
      const { error } = rejectModificationSchema.validate({
        ...validRejection,
        reason: 'a'.repeat(500),
      });
      expect(error).toBeUndefined();
    });

    it('should reject empty reason', () => {
      const { error } = rejectModificationSchema.validate({
        ...validRejection,
        reason: '',
      });
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/is not allowed to be empty|length must be at least 10/);
    });
  });
});
