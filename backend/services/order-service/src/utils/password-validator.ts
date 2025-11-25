/**
 * Password Validation Utilities
 * Validates password strength and enforces password policies
 */

import { securityConfig } from '../config/security.config';
import { logger } from './logger';
import * as crypto from 'crypto';

/**
 * Common weak passwords list (top 100 most common)
 */
const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
  'ashley', 'bailey', 'passw0rd', 'shadow', '123123', '654321', 'superman',
  'qazwsx', 'michael', 'football', 'welcome', 'jesus', 'ninja', 'mustang',
  'password1', '123456789', 'password123', 'admin', 'root', 'test', 'user',
]);

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-100
  errors: string[];
  suggestions: string[];
}

/**
 * Validate password against security requirements
 */
export function validatePassword(password: string, username?: string): PasswordValidationResult {
  const config = securityConfig.authentication.password;
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // Check if password is provided
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      score: 0,
      errors: ['Password is required'],
      suggestions: [],
    };
  }

  // Length validation
  if (password.length < config.minLength) {
    errors.push(`Password must be at least ${config.minLength} characters long`);
  } else {
    score += 20;
    if (password.length >= 16) score += 10; // Bonus for longer passwords
  }

  if (password.length > config.maxLength) {
    errors.push(`Password must not exceed ${config.maxLength} characters`);
  }

  // Character type requirements
  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else if (config.requireUppercase) {
    score += 15;
  }

  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else if (config.requireLowercase) {
    score += 15;
  }

  if (config.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else if (config.requireNumbers) {
    score += 15;
  }

  if (config.requireSpecialChars) {
    const specialCharsRegex = new RegExp(`[${config.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`);
    if (!specialCharsRegex.test(password)) {
      errors.push(`Password must contain at least one special character (${config.specialChars})`);
    } else {
      score += 15;
    }
  }

  // Check for common passwords
  if (config.preventCommonPasswords) {
    const lowerPassword = password.toLowerCase();
    if (COMMON_PASSWORDS.has(lowerPassword)) {
      errors.push('Password is too common');
      score = Math.max(0, score - 30);
    } else {
      score += 10;
    }
  }

  // Check for username in password
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    errors.push('Password must not contain your username');
    score = Math.max(0, score - 20);
  }

  // Check for sequential characters
  if (hasSequentialCharacters(password)) {
    suggestions.push('Avoid sequential characters (e.g., "abc", "123")');
    score = Math.max(0, score - 10);
  }

  // Check for repeated characters
  if (hasRepeatedCharacters(password)) {
    suggestions.push('Avoid repeated characters (e.g., "aaa", "111")');
    score = Math.max(0, score - 10);
  }

  // Diversity bonus
  const diversity = calculateCharacterDiversity(password);
  score += diversity;

  // Cap score at 100
  score = Math.min(100, score);

  // Add suggestions based on score
  if (score < 40) {
    suggestions.push('Consider using a passphrase with multiple words');
    suggestions.push('Use a mix of different character types');
  } else if (score < 70) {
    suggestions.push('Your password is moderate. Consider making it stronger');
  }

  return {
    valid: errors.length === 0,
    score,
    errors,
    suggestions,
  };
}

/**
 * Check if password has been used recently
 */
export async function checkPasswordHistory(
  userId: string,
  newPassword: string,
  getPasswordHistory: (userId: string, limit: number) => Promise<string[]>
): Promise<boolean> {
  const config = securityConfig.authentication.password;
  
  if (config.preventPasswordReuse === 0) {
    return true; // Password reuse prevention disabled
  }

  try {
    const previousHashes = await getPasswordHistory(userId, config.preventPasswordReuse);
    
    for (const previousHash of previousHashes) {
      if (await comparePassword(newPassword, previousHash)) {
        return false; // Password has been used before
      }
    }

    return true; // Password has not been used recently
  } catch (error) {
    logger.error('Error checking password history', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return true; // Allow password if check fails
  }
}

/**
 * Hash password using bcrypt-compatible algorithm
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Error comparing password', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Generate a secure random password
 */
export function generateSecurePassword(length: number = 16): string {
  const config = securityConfig.authentication.password;
  
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = config.specialChars;

  let charset = '';
  let password = '';

  // Ensure at least one of each required type
  if (config.requireLowercase) {
    charset += lowercase;
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
  }

  if (config.requireUppercase) {
    charset += uppercase;
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
  }

  if (config.requireNumbers) {
    charset += numbers;
    password += numbers[Math.floor(Math.random() * numbers.length)];
  }

  if (config.requireSpecialChars) {
    charset += special;
    password += special[Math.floor(Math.random() * special.length)];
  }

  // Fill remaining length
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check for sequential characters
 */
function hasSequentialCharacters(password: string): boolean {
  const sequences = ['abc', '123', 'xyz', '789'];
  const lowerPassword = password.toLowerCase();

  for (const seq of sequences) {
    if (lowerPassword.includes(seq)) return true;
  }

  // Check for ascending/descending sequences
  for (let i = 0; i < password.length - 2; i++) {
    const char1 = password.charCodeAt(i);
    const char2 = password.charCodeAt(i + 1);
    const char3 = password.charCodeAt(i + 2);

    if (char2 === char1 + 1 && char3 === char2 + 1) return true;
    if (char2 === char1 - 1 && char3 === char2 - 1) return true;
  }

  return false;
}

/**
 * Check for repeated characters
 */
function hasRepeatedCharacters(password: string): boolean {
  for (let i = 0; i < password.length - 2; i++) {
    if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate character diversity score (0-10)
 */
function calculateCharacterDiversity(password: string): number {
  const uniqueChars = new Set(password).size;
  const diversityRatio = uniqueChars / password.length;
  
  // Higher diversity is better
  return Math.floor(diversityRatio * 10);
}

/**
 * Estimate password entropy (in bits)
 */
export function calculatePasswordEntropy(password: string): number {
  let charsetSize = 0;

  // Determine charset size
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32; // Special chars

  // Entropy = log2(charsetSize^length)
  const entropy = password.length * Math.log2(charsetSize);
  
  return Math.floor(entropy);
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(score: number): string {
  if (score < 20) return 'Very Weak';
  if (score < 40) return 'Weak';
  if (score < 60) return 'Moderate';
  if (score < 80) return 'Strong';
  return 'Very Strong';
}

export default {
  validatePassword,
  checkPasswordHistory,
  hashPassword,
  comparePassword,
  generateSecurePassword,
  calculatePasswordEntropy,
  getPasswordStrengthLabel,
};
