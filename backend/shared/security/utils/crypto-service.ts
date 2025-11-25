import crypto from 'crypto';
import bcrypt from 'bcrypt';
// import { promisify } from 'util';

export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly SALT_ROUNDS = 12;
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  // Encrypt sensitive data
  static async encrypt(text: string, masterKey?: string): Promise<string> {
    const key = masterKey || process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('Encryption key not configured');

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const salt = crypto.randomBytes(64);

    const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, this.KEY_LENGTH, 'sha256');

    const cipher = crypto.createCipheriv(this.ALGORITHM, derivedKey, iv);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

    const tag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, tag, encrypted]);

    return combined.toString('base64');
  }

  // Decrypt sensitive data
  static async decrypt(encryptedData: string, masterKey?: string): Promise<string> {
    const key = masterKey || process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('Encryption key not configured');

    const combined = Buffer.from(encryptedData, 'base64');

    const salt = combined.slice(0, 64);
    const iv = combined.slice(64, 64 + this.IV_LENGTH);
    const tag = combined.slice(64 + this.IV_LENGTH, 64 + this.IV_LENGTH + this.TAG_LENGTH);
    const encrypted = combined.slice(64 + this.IV_LENGTH + this.TAG_LENGTH);

    const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, this.KEY_LENGTH, 'sha256');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  }

  // Hash passwords with bcrypt
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  // Verify password
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Generate secure random tokens
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate cryptographically secure OTP
  static generateOTP(length: number = 6): string {
    const digits = '0123456789';
    let otp = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      otp += digits[randomIndex];
    }

    return otp;
  }

  // Base32 decode helper function
  private static base32Decode(encoded: string): Buffer {
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = encoded
      .toUpperCase()
      .replace(/=+$/, '')
      .split('')
      .map((char) => base32chars.indexOf(char).toString(2).padStart(5, '0'))
      .join('');

    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      if (i + 8 <= bits.length) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
      }
    }
    return Buffer.from(bytes);
  }

  // Time-based OTP for 2FA
  static generateTOTP(secret: string, window: number = 30): string {
    const counter = Math.floor(Date.now() / 1000 / window);
    const secretBuffer = this.base32Decode(secret);
    const hmac = crypto.createHmac('sha1', secretBuffer);
    hmac.update(Buffer.from(counter.toString(16).padStart(16, '0'), 'hex'));

    const digest = hmac.digest();
    if (!digest || digest.length === 0) throw new Error('Invalid digest data');
    const offset = digest[digest.length - 1] & 0x0f;
    const code = digest.readUInt32BE(offset) & 0x7fffffff;

    return (code % 1000000).toString().padStart(6, '0');
  }

  // Generate secure API keys
  static generateAPIKey(): string {
    const prefix = 'sk_live_';
    const key = crypto.randomBytes(32).toString('base64url');
    return `${prefix}${key}`;
  }

  // Hash API keys for storage
  static hashAPIKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  // Mask sensitive data
  static maskData(data: string, showLast: number = 4): string {
    if (data.length <= showLast) return '*'.repeat(data.length);

    const masked = '*'.repeat(data.length - showLast);
    const visible = data.slice(-showLast);

    return masked + visible;
  }

  // Sign data with HMAC
  static sign(data: string, secret?: string): string {
    const key = secret || process.env.SIGNING_SECRET;
    if (!key) throw new Error('Signing secret not configured');

    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  // Verify signed data
  static verify(data: string, signature: string, secret?: string): boolean {
    const key = secret || process.env.SIGNING_SECRET;
    if (!key) throw new Error('Signing secret not configured');

    const expected = this.sign(data, key);

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  // Encrypt database fields (now async)
  static async encryptField(value: any): Promise<string> {
    if (value === null || value === undefined) return value;

    const jsonString = JSON.stringify(value);
    return this.encrypt(jsonString);
  }

  // Decrypt database fields
  static async decryptField(encryptedValue: string): Promise<any> {
    if (!encryptedValue) return null;

    const decrypted = await this.decrypt(encryptedValue);
    return JSON.parse(decrypted);
  }
}
