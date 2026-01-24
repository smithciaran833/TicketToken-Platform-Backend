import {
  SAFE_SCHEDULE_FIELDS,
  FORBIDDEN_SCHEDULE_FIELDS,
  SAFE_SCHEDULE_SELECT,
  serializeSchedule,
  serializeSchedules,
  findForbiddenScheduleFields,
  findMissingSafeScheduleFields,
  SafeSchedule,
} from '../../../src/serializers/schedule.serializer';

describe('Schedule Serializer', () => {
  // Mock raw schedule from database with ALL fields including sensitive ones
  const mockRawSchedule = {
    // Safe fields
    id: 'schedule-123',
    tenant_id: 'tenant-123',
    event_id: 'event-456',
    starts_at: '2026-06-15T19:00:00Z',
    ends_at: '2026-06-15T23:00:00Z',
    doors_open_at: '2026-06-15T18:00:00Z',
    is_recurring: false,
    recurrence_rule: null,
    recurrence_end_date: null,
    occurrence_number: 1,
    timezone: 'America/New_York',
    utc_offset: -4,
    status: 'SCHEDULED',
    capacity_override: 1000,
    check_in_opens_at: '2026-06-15T17:30:00Z',
    check_in_closes_at: '2026-06-15T20:00:00Z',
    notes: 'Doors open 1 hour early for VIP',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',

    // FORBIDDEN fields that should be stripped
    metadata: {
      internal_flag: true,
      staff_count: 50,
      security_notes: 'Extra security at gate A',
    },
    status_reason: 'Approved by operations team',
    created_by: 'user-123',
    updated_by: 'user-456',
    version: 2,
    deleted_at: null,
  };

  describe('SAFE_SCHEDULE_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_SCHEDULE_FIELDS).toBeDefined();
      expect(SAFE_SCHEDULE_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential schedule fields', () => {
      expect(SAFE_SCHEDULE_FIELDS).toContain('id');
      expect(SAFE_SCHEDULE_FIELDS).toContain('event_id');
      expect(SAFE_SCHEDULE_FIELDS).toContain('starts_at');
      expect(SAFE_SCHEDULE_FIELDS).toContain('ends_at');
      expect(SAFE_SCHEDULE_FIELDS).toContain('timezone');
      expect(SAFE_SCHEDULE_FIELDS).toContain('status');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_SCHEDULE_FIELDS) {
        expect(SAFE_SCHEDULE_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_SCHEDULE_FIELDS', () => {
    it('should include internal metadata', () => {
      expect(FORBIDDEN_SCHEDULE_FIELDS).toContain('metadata');
      expect(FORBIDDEN_SCHEDULE_FIELDS).toContain('status_reason');
    });

    it('should include internal tracking fields', () => {
      expect(FORBIDDEN_SCHEDULE_FIELDS).toContain('created_by');
      expect(FORBIDDEN_SCHEDULE_FIELDS).toContain('updated_by');
      expect(FORBIDDEN_SCHEDULE_FIELDS).toContain('version');
      expect(FORBIDDEN_SCHEDULE_FIELDS).toContain('deleted_at');
    });
  });

  describe('SAFE_SCHEDULE_SELECT', () => {
    it('should be a comma-separated string', () => {
      expect(typeof SAFE_SCHEDULE_SELECT).toBe('string');
      expect(SAFE_SCHEDULE_SELECT).toContain('id');
      expect(SAFE_SCHEDULE_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_SCHEDULE_SELECT).not.toContain('metadata');
      expect(SAFE_SCHEDULE_SELECT).not.toContain('created_by');
    });
  });

  describe('serializeSchedule', () => {
    it('should return only safe fields', () => {
      const result = serializeSchedule(mockRawSchedule);

      expect(result.id).toBe(mockRawSchedule.id);
      expect(result.tenantId).toBe(mockRawSchedule.tenant_id);
      expect(result.eventId).toBe(mockRawSchedule.event_id);
      expect(result.startsAt).toBe(mockRawSchedule.starts_at);
      expect(result.timezone).toBe('America/New_York');
    });

    it('should strip forbidden fields', () => {
      const result = serializeSchedule(mockRawSchedule);

      expect((result as any).metadata).toBeUndefined();
      expect((result as any).statusReason).toBeUndefined();
      expect((result as any).status_reason).toBeUndefined();
      expect((result as any).createdBy).toBeUndefined();
      expect((result as any).created_by).toBeUndefined();
      expect((result as any).version).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeSchedule(mockRawSchedule);

      expect(result.tenantId).toBeDefined();
      expect(result.eventId).toBeDefined();
      expect(result.startsAt).toBeDefined();
      expect(result.endsAt).toBeDefined();
      expect(result.doorsOpenAt).toBeDefined();
      expect(result.isRecurring).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeSchedule(null as any)).toThrow('Cannot serialize null or undefined schedule');
    });

    it('should handle optional fields gracefully', () => {
      const minimalSchedule = {
        id: '123',
        tenant_id: 'tenant-1',
        event_id: 'event-1',
        starts_at: new Date(),
        ends_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = serializeSchedule(minimalSchedule);
      expect(result.id).toBe('123');
      expect(result.doorsOpenAt).toBeNull();
      expect(result.recurrenceRule).toBeNull();
    });
  });

  describe('serializeSchedules', () => {
    it('should serialize array of schedule objects', () => {
      const schedules = [mockRawSchedule, { ...mockRawSchedule, id: 'schedule-2' }];
      const result = serializeSchedules(schedules);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawSchedule.id);
      expect(result[1].id).toBe('schedule-2');
    });

    it('should return empty array for null input', () => {
      expect(serializeSchedules(null as any)).toEqual([]);
    });

    it('should strip forbidden fields from all schedules', () => {
      const schedules = [mockRawSchedule, { ...mockRawSchedule, id: 'schedule-2' }];
      const result = serializeSchedules(schedules);

      for (const schedule of result) {
        expect((schedule as any).metadata).toBeUndefined();
        expect((schedule as any).version).toBeUndefined();
      }
    });
  });

  describe('findForbiddenScheduleFields', () => {
    it('should find forbidden fields in raw object', () => {
      const found = findForbiddenScheduleFields(mockRawSchedule);

      expect(found).toContain('metadata');
      expect(found).toContain('status_reason');
      expect(found).toContain('version');
    });

    it('should return empty array for safe object', () => {
      const safeSchedule = serializeSchedule(mockRawSchedule);
      const found = findForbiddenScheduleFields(safeSchedule);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeScheduleFields', () => {
    it('should return empty for complete serialized schedule', () => {
      const safeSchedule = serializeSchedule(mockRawSchedule);
      const missing = findMissingSafeScheduleFields(safeSchedule);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeScheduleFields(incomplete);

      expect(missing).toContain('tenantId');
      expect(missing).toContain('eventId');
      expect(missing).toContain('startsAt');
      expect(missing).toContain('endsAt');
    });
  });

  describe('Security validation', () => {
    it('should never leak internal metadata', () => {
      const result = serializeSchedule(mockRawSchedule);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('internal_flag');
      expect(jsonString).not.toContain('staff_count');
      expect(jsonString).not.toContain('security_notes');
    });

    it('should never leak status reason', () => {
      const result = serializeSchedule(mockRawSchedule);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('Approved by operations team');
      expect(jsonString).not.toContain('statusReason');
    });
  });
});
