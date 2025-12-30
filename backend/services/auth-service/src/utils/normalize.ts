/**
 * String Normalization Utilities
 * 
 * SEC8: Unicode normalization before string comparison
 * Prevents homograph attacks and ensures consistent string handling
 */

/**
 * Normalize email address for storage and comparison
 * - Lowercase
 * - Unicode NFC normalization
 * - Trim whitespace
 */
export function normalizeEmail(email: string): string {
  if (!email) return '';
  return email
    .normalize('NFC')
    .toLowerCase()
    .trim();
}

/**
 * Normalize username for storage and comparison
 * - Unicode NFC normalization
 * - Trim whitespace
 * - Lowercase (optional, based on your requirements)
 */
export function normalizeUsername(username: string, lowercase = true): string {
  if (!username) return '';
  let normalized = username.normalize('NFC').trim();
  if (lowercase) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/**
 * Normalize general text input
 * - Unicode NFC normalization
 * - Trim whitespace
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text.normalize('NFC').trim();
}

/**
 * Normalize phone number
 * - Remove all non-digit characters except leading +
 * - Validate E.164 format
 */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  
  // Keep leading + if present, remove all other non-digits
  const cleaned = phone.replace(/(?!^\+)[^\d]/g, '');
  
  // Validate E.164 format: +[country code][number], 8-15 digits total
  const e164Regex = /^\+?[1-9]\d{7,14}$/;
  
  if (!e164Regex.test(cleaned)) {
    return null; // Invalid phone number
  }
  
  // Ensure leading + for E.164
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/**
 * Check if two strings are equal after normalization
 */
export function normalizedEquals(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}
