import { DateTime, IANAZone } from 'luxon';

/**
 * Timezone Validator
 * 
 * Validates timezone strings against the IANA timezone database using Luxon.
 * Ensures that only valid timezone names are accepted (e.g., 'America/New_York', 'Europe/London').
 */

/**
 * Validates if a timezone string is a valid IANA timezone
 * 
 * @param timezone - The timezone string to validate (e.g., 'America/New_York')
 * @returns true if the timezone is valid, false otherwise
 * 
 * @example
 * validateTimezone('America/New_York') // true
 * validateTimezone('Europe/London') // true
 * validateTimezone('UTC') // true
 * validateTimezone('INVALID_TIMEZONE') // false
 * validateTimezone('') // false
 */
export function validateTimezone(timezone: string | undefined | null): boolean {
  if (!timezone || typeof timezone !== 'string' || timezone.trim() === '') {
    return false;
  }

  // Use Luxon's IANAZone to check if the timezone is valid
  return IANAZone.isValidZone(timezone);
}

/**
 * Validates a timezone and throws an error if invalid
 * 
 * @param timezone - The timezone string to validate
 * @throws Error if the timezone is invalid
 */
export function validateTimezoneOrThrow(timezone: string | undefined | null): void {
  if (!timezone) {
    return; // Allow undefined/null (will use default)
  }

  if (!validateTimezone(timezone)) {
    throw new Error(
      `Invalid timezone: "${timezone}". Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC'). ` +
      `See https://en.wikipedia.org/wiki/List_of_tz_database_time_zones for valid timezone names.`
    );
  }
}

/**
 * Get all available timezone names
 * 
 * @returns Array of all valid IANA timezone names
 */
export function getAllTimezones(): string[] {
  // Common timezones for reference
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Mexico_City',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Rome',
    'Europe/Madrid',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Singapore',
    'Asia/Dubai',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland'
  ];
}

/**
 * Convert a timezone string to a DateTime object to ensure it's processable
 * 
 * @param timezone - The timezone string
 * @returns DateTime object in the specified timezone, or null if invalid
 */
export function getTimezoneInfo(timezone: string): { name: string; offset: string; isValid: boolean } | null {
  if (!validateTimezone(timezone)) {
    return null;
  }

  const now = DateTime.now().setZone(timezone);
  
  return {
    name: timezone,
    offset: now.toFormat('ZZ'),
    isValid: now.isValid
  };
}
