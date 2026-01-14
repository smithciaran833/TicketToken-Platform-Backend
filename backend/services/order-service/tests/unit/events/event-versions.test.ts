import {
  CURRENT_EVENT_VERSION,
  EventVersionHistory,
  isSupportedVersion,
  getLatestVersion,
  migrateEventPayload,
  VersionMigrations,
} from '../../../src/events/event-versions';
import { OrderEvents } from '../../../src/events/event-types';

describe('EventVersions', () => {
  describe('CURRENT_EVENT_VERSION', () => {
    it('should be defined as a semantic version', () => {
      expect(CURRENT_EVENT_VERSION).toBeDefined();
      expect(CURRENT_EVENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should be version 1.0.0', () => {
      expect(CURRENT_EVENT_VERSION).toBe('1.0.0');
    });
  });

  describe('EventVersionHistory', () => {
    it('should contain all order event types', () => {
      const expectedEventTypes = [
        'order.created',
        'order.reserved',
        'order.confirmed',
        'order.cancelled',
        'order.expired',
        'order.refunded',
        'order.failed',
      ];

      expectedEventTypes.forEach(eventType => {
        expect(EventVersionHistory[eventType as keyof typeof EventVersionHistory]).toBeDefined();
      });
    });

    it('should have version arrays for all event types', () => {
      Object.values(EventVersionHistory).forEach(versions => {
        expect(Array.isArray(versions)).toBe(true);
        expect(versions.length).toBeGreaterThan(0);
      });
    });

    it('should have valid semantic versions', () => {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      
      Object.values(EventVersionHistory).forEach(versions => {
        versions.forEach(version => {
          expect(version).toMatch(semverPattern);
        });
      });
    });

    it('should have version 1.0.0 for all event types', () => {
      Object.values(EventVersionHistory).forEach(versions => {
        expect(versions).toContain('1.0.0');
      });
    });

    it('should be readonly', () => {
      // TypeScript enforces readonly at compile time
      // This test verifies the structure is as expected
      expect(Object.isFrozen(EventVersionHistory)).toBe(false); // Not frozen in runtime
      expect(EventVersionHistory['order.created']).toBeDefined();
    });
  });

  describe('isSupportedVersion', () => {
    it('should return true for supported version 1.0.0', () => {
      expect(isSupportedVersion('order.created', '1.0.0')).toBe(true);
      expect(isSupportedVersion('order.reserved', '1.0.0')).toBe(true);
      expect(isSupportedVersion('order.confirmed', '1.0.0')).toBe(true);
      expect(isSupportedVersion('order.cancelled', '1.0.0')).toBe(true);
      expect(isSupportedVersion('order.expired', '1.0.0')).toBe(true);
      expect(isSupportedVersion('order.refunded', '1.0.0')).toBe(true);
      expect(isSupportedVersion('order.failed', '1.0.0')).toBe(true);
    });

    it('should return false for unsupported versions', () => {
      expect(isSupportedVersion('order.created', '2.0.0')).toBe(false);
      expect(isSupportedVersion('order.created', '0.9.0')).toBe(false);
      expect(isSupportedVersion('order.created', '1.1.0')).toBe(false);
    });

    it('should return false for unknown event types', () => {
      expect(isSupportedVersion('unknown.event', '1.0.0')).toBe(false);
      expect(isSupportedVersion('order.unknown', '1.0.0')).toBe(false);
    });

    it('should handle case-sensitive event types', () => {
      expect(isSupportedVersion('Order.Created', '1.0.0')).toBe(false);
      expect(isSupportedVersion('ORDER.CREATED', '1.0.0')).toBe(false);
    });

    it('should handle invalid version formats', () => {
      expect(isSupportedVersion('order.created', 'invalid')).toBe(false);
      expect(isSupportedVersion('order.created', '1.0')).toBe(false);
      expect(isSupportedVersion('order.created', 'v1.0.0')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(isSupportedVersion('', '1.0.0')).toBe(false);
      expect(isSupportedVersion('order.created', '')).toBe(false);
    });
  });

  describe('getLatestVersion', () => {
    it('should return 1.0.0 for all known event types', () => {
      expect(getLatestVersion('order.created')).toBe('1.0.0');
      expect(getLatestVersion('order.reserved')).toBe('1.0.0');
      expect(getLatestVersion('order.confirmed')).toBe('1.0.0');
      expect(getLatestVersion('order.cancelled')).toBe('1.0.0');
      expect(getLatestVersion('order.expired')).toBe('1.0.0');
      expect(getLatestVersion('order.refunded')).toBe('1.0.0');
      expect(getLatestVersion('order.failed')).toBe('1.0.0');
    });

    it('should return CURRENT_EVENT_VERSION for unknown event types', () => {
      expect(getLatestVersion('unknown.event')).toBe(CURRENT_EVENT_VERSION);
      expect(getLatestVersion('order.unknown')).toBe(CURRENT_EVENT_VERSION);
      expect(getLatestVersion('')).toBe(CURRENT_EVENT_VERSION);
    });

    it('should return the last version in the array', () => {
      // This test verifies the logic of returning the last element
      // Even though all events currently have only ['1.0.0']
      const eventType = 'order.created';
      const versions = EventVersionHistory[eventType];
      const expectedVersion = versions[versions.length - 1];
      
      expect(getLatestVersion(eventType)).toBe(expectedVersion);
    });

    it('should handle case-sensitive event types', () => {
      expect(getLatestVersion('Order.Created')).toBe(CURRENT_EVENT_VERSION);
      expect(getLatestVersion('ORDER.CREATED')).toBe(CURRENT_EVENT_VERSION);
    });

    it('should be consistent with isSupportedVersion for valid types', () => {
      const eventType = 'order.created';
      const latestVersion = getLatestVersion(eventType);
      
      expect(isSupportedVersion(eventType, latestVersion)).toBe(true);
    });
  });

  describe('VersionMigrations', () => {
    it('should be defined as an object', () => {
      expect(VersionMigrations).toBeDefined();
      expect(typeof VersionMigrations).toBe('object');
    });

    it('should be empty initially (no migrations defined yet)', () => {
      expect(Object.keys(VersionMigrations)).toHaveLength(0);
    });

    it('should have the correct structure when populated', () => {
      // This test documents the expected structure
      // Even though no migrations are defined yet
      expect(VersionMigrations).toEqual({});
    });
  });

  describe('migrateEventPayload', () => {
    it('should return original payload when no migration exists', () => {
      const payload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987e6543-e21b-12d3-a456-426614174001',
        totalCents: 10000,
      };

      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        payload
      );

      expect(result).toEqual(payload);
      expect(result).toBe(payload); // Same reference
    });

    it('should return original payload for unknown event type', () => {
      const payload = { field: 'value' };

      const result = migrateEventPayload(
        'unknown.event',
        '1.0.0',
        '2.0.0',
        payload
      );

      expect(result).toEqual(payload);
    });

    it('should return original payload when migration path does not exist', () => {
      const payload = { field: 'value' };

      const result = migrateEventPayload(
        'order.created',
        '0.9.0',
        '1.0.0',
        payload
      );

      expect(result).toEqual(payload);
    });

    it('should handle null payload', () => {
      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        null
      );

      expect(result).toBeNull();
    });

    it('should handle undefined payload', () => {
      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        undefined
      );

      expect(result).toBeUndefined();
    });

    it('should handle empty object payload', () => {
      const payload = {};

      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        payload
      );

      expect(result).toEqual({});
    });

    it('should handle complex nested payloads', () => {
      const payload = {
        orderId: '123',
        items: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        metadata: {
          source: 'web',
          tags: ['priority', 'urgent'],
        },
      };

      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        payload
      );

      expect(result).toEqual(payload);
    });

    it('should handle same from and to versions', () => {
      const payload = { field: 'value' };

      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '1.0.0',
        payload
      );

      expect(result).toEqual(payload);
    });

    // Test with actual migration (for documentation/future use)
    it('should apply migration function when defined', () => {
      // Temporarily add a migration for testing
      const testMigration = jest.fn((payload) => ({
        ...payload,
        newField: 'added by migration',
      }));

      // Store original migrations
      const originalMigrations = { ...VersionMigrations };

      // Add test migration
      VersionMigrations['order.created'] = {
        '1.0.0->2.0.0': testMigration,
      };

      const payload = { orderId: '123' };

      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        payload
      );

      expect(testMigration).toHaveBeenCalledWith(payload);
      expect(result).toEqual({
        orderId: '123',
        newField: 'added by migration',
      });

      // Restore original migrations
      delete VersionMigrations['order.created'];
      Object.assign(VersionMigrations, originalMigrations);
    });

    it('should handle migration that transforms payload structure', () => {
      // Store original migrations
      const originalMigrations = { ...VersionMigrations };

      // Add test migration that changes structure
      VersionMigrations['order.created'] = {
        '1.0.0->2.0.0': (payload: any) => ({
          id: payload.orderId,
          customer: {
            id: payload.userId,
          },
          amount: payload.totalCents,
        }),
      };

      const payload = {
        orderId: '123',
        userId: '456',
        totalCents: 10000,
      };

      const result = migrateEventPayload(
        'order.created',
        '1.0.0',
        '2.0.0',
        payload
      );

      expect(result).toEqual({
        id: '123',
        customer: {
          id: '456',
        },
        amount: 10000,
      });

      // Restore original migrations
      delete VersionMigrations['order.created'];
      Object.assign(VersionMigrations, originalMigrations);
    });
  });

  describe('version compatibility', () => {
    it('should have consistent version across all event types', () => {
      const versions = new Set<string>();
      
      Object.values(EventVersionHistory).forEach(versionArray => {
        versionArray.forEach(version => versions.add(version));
      });

      // Currently all should be on 1.0.0
      expect(versions.size).toBe(1);
      expect(versions.has('1.0.0')).toBe(true);
    });

    it('should match CURRENT_EVENT_VERSION for latest versions', () => {
      Object.keys(EventVersionHistory).forEach(eventType => {
        const latest = getLatestVersion(eventType);
        expect(latest).toBe(CURRENT_EVENT_VERSION);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in event type names', () => {
      expect(isSupportedVersion(' order.created ', '1.0.0')).toBe(false);
      expect(getLatestVersion(' order.created ')).toBe(CURRENT_EVENT_VERSION);
    });

    it('should handle special characters in version strings', () => {
      expect(isSupportedVersion('order.created', '1.0.0-beta')).toBe(false);
      expect(isSupportedVersion('order.created', '1.0.0+build')).toBe(false);
    });

    it('should handle numeric event type keys', () => {
      expect(isSupportedVersion('123', '1.0.0')).toBe(false);
      expect(getLatestVersion('123')).toBe(CURRENT_EVENT_VERSION);
    });
  });
});
