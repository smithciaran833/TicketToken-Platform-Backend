/**
 * Event versioning system
 * Manages event schema versions and compatibility
 */

export const CURRENT_EVENT_VERSION = '1.0.0';

/**
 * Version history for each event type
 */
export const EventVersionHistory = {
  'order.created': ['1.0.0'],
  'order.reserved': ['1.0.0'],
  'order.confirmed': ['1.0.0'],
  'order.cancelled': ['1.0.0'],
  'order.expired': ['1.0.0'],
  'order.refunded': ['1.0.0'],
  'order.failed': ['1.0.0'],
} as const;

/**
 * Check if a version is supported for a given event type
 */
export function isSupportedVersion(eventType: string, version: string): boolean {
  const versions = EventVersionHistory[eventType as keyof typeof EventVersionHistory];
  return versions ? versions.includes(version as any) : false;
}

/**
 * Get the latest version for an event type
 */
export function getLatestVersion(eventType: string): string {
  const versions = EventVersionHistory[eventType as keyof typeof EventVersionHistory];
  if (!versions) {
    return CURRENT_EVENT_VERSION;
  }
  return versions[versions.length - 1];
}

/**
 * Migration guide for version upgrades
 * Maps old version -> new version with transformation function
 */
export const VersionMigrations: Record<string, Record<string, (payload: any) => any>> = {
  // Example: When we create v2.0.0, add migration here
  // 'order.created': {
  //   '1.0.0->2.0.0': (payload) => {
  //     return {
  //       ...payload,
  //       newField: 'default value'
  //     };
  //   }
  // }
};

/**
 * Migrate event payload from one version to another
 */
export function migrateEventPayload(
  eventType: string,
  fromVersion: string,
  toVersion: string,
  payload: any
): any {
  const migrationKey = `${fromVersion}->${toVersion}`;
  const eventMigrations = VersionMigrations[eventType];

  if (!eventMigrations || !eventMigrations[migrationKey]) {
    // No migration needed or available
    return payload;
  }

  return eventMigrations[migrationKey](payload);
}
