import { encrypt, decrypt, generateKey, TokenEncryptionResult } from '../utils/security';

/**
 * Token storage interface
 */
export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  setAccessToken(token: string): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearTokens(): Promise<void>;
}

/**
 * In-memory token storage (default, most secure for browser)
 */
export class MemoryTokenStorage implements TokenStorage {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  async getAccessToken(): Promise<string | null> {
    return this.accessToken;
  }

  async setAccessToken(token: string): Promise<void> {
    this.accessToken = token;
  }

  async getRefreshToken(): Promise<string | null> {
    return this.refreshToken;
  }

  async setRefreshToken(token: string): Promise<void> {
    this.refreshToken = token;
  }

  async clearTokens(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
  }
}

/**
 * Encrypted local storage adapter
 */
export class EncryptedLocalStorage implements TokenStorage {
  private readonly encryptionKey: Buffer;
  private readonly prefix: string;

  constructor(options: { encryptionKey?: string | Buffer; prefix?: string } = {}) {
    this.encryptionKey = options.encryptionKey 
      ? (typeof options.encryptionKey === 'string' 
          ? Buffer.from(options.encryptionKey, 'hex') 
          : options.encryptionKey)
      : generateKey(32);
    this.prefix = options.prefix || 'tickettoken_';
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private async encryptToken(token: string): Promise<string> {
    const result = encrypt(token, { key: this.encryptionKey });
    return JSON.stringify(result);
  }

  private async decryptToken(encrypted: string): Promise<string> {
    const parsed: TokenEncryptionResult = JSON.parse(encrypted);
    return decrypt(parsed.encrypted, parsed.iv, { key: this.encryptionKey });
  }

  async getAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const encrypted = window.localStorage.getItem(this.getKey('access_token'));
      if (!encrypted) return null;
      return await this.decryptToken(encrypted);
    } catch {
      return null;
    }
  }

  async setAccessToken(token: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage not available');
    }

    const encrypted = await this.encryptToken(token);
    window.localStorage.setItem(this.getKey('access_token'), encrypted);
  }

  async getRefreshToken(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    try {
      const encrypted = window.localStorage.getItem(this.getKey('refresh_token'));
      if (!encrypted) return null;
      return await this.decryptToken(encrypted);
    } catch {
      return null;
    }
  }

  async setRefreshToken(token: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage not available');
    }

    const encrypted = await this.encryptToken(token);
    window.localStorage.setItem(this.getKey('refresh_token'), encrypted);
  }

  async clearTokens(): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    window.localStorage.removeItem(this.getKey('access_token'));
    window.localStorage.removeItem(this.getKey('refresh_token'));
  }
}

/**
 * Session storage adapter (cleared on tab close)
 */
export class SessionStorage implements TokenStorage {
  private readonly prefix: string;

  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || 'tickettoken_';
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async getAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }

    return window.sessionStorage.getItem(this.getKey('access_token'));
  }

  async setAccessToken(token: string): Promise<void> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      throw new Error('sessionStorage not available');
    }

    window.sessionStorage.setItem(this.getKey('access_token'), token);
  }

  async getRefreshToken(): Promise<string | null> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }

    return window.sessionStorage.getItem(this.getKey('refresh_token'));
  }

  async setRefreshToken(token: string): Promise<void> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      throw new Error('sessionStorage not available');
    }

    window.sessionStorage.setItem(this.getKey('refresh_token'), token);
  }

  async clearTokens(): Promise<void> {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }

    window.sessionStorage.removeItem(this.getKey('access_token'));
    window.sessionStorage.removeItem(this.getKey('refresh_token'));
  }
}

/**
 * Cookie storage adapter (for SSR/Next.js)
 */
export class CookieStorage implements TokenStorage {
  private readonly prefix: string;
  private readonly secure: boolean;
  private readonly sameSite: 'strict' | 'lax' | 'none';
  private readonly domain?: string;

  constructor(options: {
    prefix?: string;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
  } = {}) {
    this.prefix = options.prefix || 'tickettoken_';
    this.secure = options.secure !== false; // Default to true
    this.sameSite = options.sameSite || 'lax';
    this.domain = options.domain;
  }

  private getCookieName(key: string): string {
    return `${this.prefix}${key}`;
  }

  private setCookie(name: string, value: string, maxAge: number = 31536000): void {
    if (typeof document === 'undefined') {
      throw new Error('Cookies not available in this environment');
    }

    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      `Max-Age=${maxAge}`,
      `Path=/`,
      `SameSite=${this.sameSite}`
    ];

    if (this.secure) {
      parts.push('Secure');
    }

    if (this.domain) {
      parts.push(`Domain=${this.domain}`);
    }

    parts.push('HttpOnly'); // Can't be set from JavaScript, but document for server-side

    document.cookie = parts.join('; ');
  }

  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const matches = document.cookie.match(
      new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`)
    );

    return matches ? decodeURIComponent(matches[1]) : null;
  }

  private deleteCookie(name: string): void {
    this.setCookie(name, '', -1);
  }

  async getAccessToken(): Promise<string | null> {
    return this.getCookie(this.getCookieName('access_token'));
  }

  async setAccessToken(token: string): Promise<void> {
    this.setCookie(this.getCookieName('access_token'), token, 3600); // 1 hour
  }

  async getRefreshToken(): Promise<string | null> {
    return this.getCookie(this.getCookieName('refresh_token'));
  }

  async setRefreshToken(token: string): Promise<void> {
    this.setCookie(this.getCookieName('refresh_token'), token, 2592000); // 30 days
  }

  async clearTokens(): Promise<void> {
    this.deleteCookie(this.getCookieName('access_token'));
    this.deleteCookie(this.getCookieName('refresh_token'));
  }
}

/**
 * Create token storage based on environment and options
 */
export function createTokenStorage(options?: {
  type?: 'memory' | 'localStorage' | 'sessionStorage' | 'cookie';
  encryptionKey?: string | Buffer;
  prefix?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  domain?: string;
}): TokenStorage {
  const type = options?.type || 'memory';

  switch (type) {
    case 'localStorage':
      return new EncryptedLocalStorage({
        encryptionKey: options?.encryptionKey,
        prefix: options?.prefix
      });
    
    case 'sessionStorage':
      return new SessionStorage({
        prefix: options?.prefix
      });
    
    case 'cookie':
      return new CookieStorage({
        prefix: options?.prefix,
        secure: options?.secure,
        sameSite: options?.sameSite,
        domain: options?.domain
      });
    
    case 'memory':
    default:
      return new MemoryTokenStorage();
  }
}
