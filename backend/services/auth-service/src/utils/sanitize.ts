/**
 * Sanitize user input to prevent XSS attacks
 * Strips HTML tags entirely (best for user names, etc.)
 */
export function stripHtml(input: string): string {
  if (typeof input !== 'string') return input;
  
  // Remove all HTML tags
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Escape HTML special characters (use for content that may contain legitimate special chars)
 */
export function escapeHtml(input: string): string {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize user name fields - strips HTML tags
 * Use this for firstName, lastName, displayName, etc.
 */
export function sanitizeName(input: string): string {
  return stripHtml(input);
}

/**
 * Sanitize an object's string properties
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T, fields: string[]): T {
  const sanitized = { ...obj };
  
  for (const field of fields) {
    if (typeof sanitized[field] === 'string') {
      (sanitized as any)[field] = stripHtml(sanitized[field]);
    }
  }
  
  return sanitized;
}

/**
 * Fields that should be sanitized for XSS
 */
export const USER_SANITIZE_FIELDS = ['firstName', 'lastName', 'first_name', 'last_name', 'display_name', 'bio', 'username'];
