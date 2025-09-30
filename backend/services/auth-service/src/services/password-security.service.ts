import argon2 from 'argon2';
import crypto from 'crypto';

export class PasswordSecurityService {
  private readonly minLength = 12;
  private readonly maxLength = 128;
  private readonly commonPasswords = new Set([
    'password123', '12345678', 'qwerty123', 'letmein', 'welcome123',
    'password', 'admin123', 'root1234', 'master123', 'pass1234'
  ]);
  
  async hashPassword(password: string): Promise<string> {
    // Validate before hashing
    const validation = this.validatePassword(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      salt: crypto.randomBytes(16)
    });
  }
  
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }
  
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < this.minLength) {
      errors.push(`Password must be at least ${this.minLength} characters`);
    }
    
    if (password.length > this.maxLength) {
      errors.push(`Password must be less than ${this.maxLength} characters`);
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    if (this.commonPasswords.has(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    // Check for sequential characters
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password cannot contain more than 2 repeated characters');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  generateSecurePassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    // Ensure at least one of each required character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*()_+-=[]{}|;:,.<>?'[Math.floor(Math.random() * 27)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}
