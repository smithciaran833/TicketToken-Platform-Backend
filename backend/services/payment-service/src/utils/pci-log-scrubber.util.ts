/**
 * PCI DSS Log Scrubbing Utility
 * Removes sensitive payment information from logs to maintain PCI compliance
 *
 * Critical for avoiding $500k+ fines for logging cardholder data
 */

/**
 * Patterns for sensitive data that must be scrubbed
 * ORDER MATTERS: More specific patterns (trackData) must come before general patterns (creditCard)
 */
const SENSITIVE_PATTERNS = {
  // Track data (magnetic stripe) - MUST be first to catch full track before card number pattern
  trackData: [
    /%B\d{13,19}\^[^\^]+\^[^\?]*\?/g, // Track 1: %B<card>^<name>^<exp+service>?
    /;\d{13,19}=\d{4,}[^;]*/g, // Track 2: ;<card>=<exp><service>
  ],

  // Credit card numbers (various formats)
  creditCard: [
    /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, // 16 digits with optional separators
    /\b\d{13,19}\b/g, // 13-19 consecutive digits (catches most cards)
  ],

  // CVV/CVC codes
  cvv: [
    /\b(cvv|cvc|cvv2|cvc2|cid|csc)[:\s]*\d{3,4}\b/gi,
    /"cvv":\s*"\d{3,4}"/gi,
    /"cvc":\s*"\d{3,4}"/gi,
  ],

  // Expiration dates in various formats
  expiration: [
    /\b(exp|expir|expiry|expiration)[:\s]*(0[1-9]|1[0-2])[\/\-]?\d{2,4}\b/gi,
    /"exp_month":\s*"\d{1,2}"/gi,
    /"exp_year":\s*"\d{2,4}"/gi,
  ],

  // PIN blocks
  pin: [
    /\b(pin|pinblock)[:\s]*[A-Fa-f0-9]{16,32}\b/gi,
  ],

  // SSN (Social Security Number)
  ssn: [
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  ],

  // Bank account numbers (8-17 digits)
  bankAccount: [
    /\b(account|acct|routing)[:\s]*\d{8,17}\b/gi,
  ],

  // Email addresses (for GDPR, not PCI, but good practice)
  email: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  ],

  // Authorization tokens and API keys
  tokens: [
    /\b(bearer|token|api[_-]?key|secret)[:\s]+[A-Za-z0-9\-._~+\/]+=*/gi,
    /"token":\s*"[^"]+"/gi,
    /"api_key":\s*"[^"]+"/gi,
  ],
};

/**
 * Replacement text for scrubbed data
 */
const SCRUBBED_TEXT = {
  trackData: '[TRACK_REDACTED]',
  creditCard: '[CARD_REDACTED]',
  cvv: '[CVV_REDACTED]',
  expiration: '[EXP_REDACTED]',
  pin: '[PIN_REDACTED]',
  ssn: '[SSN_REDACTED]',
  bankAccount: '[ACCOUNT_REDACTED]',
  email: '[EMAIL_REDACTED]',
  tokens: '[TOKEN_REDACTED]',
};

/**
 * Scrub sensitive payment data from a string
 * @param input String that may contain sensitive data
 * @returns Scrubbed string safe for logging
 */
export function scrubSensitiveData(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let scrubbed = input;

  // Apply each pattern category in order (trackData first, then creditCard, etc.)
  for (const [category, patterns] of Object.entries(SENSITIVE_PATTERNS)) {
    const replacement = SCRUBBED_TEXT[category as keyof typeof SCRUBBED_TEXT];
    for (const pattern of patterns) {
      scrubbed = scrubbed.replace(pattern, replacement);
    }
  }

  return scrubbed;
}

/**
 * Scrub sensitive data from an object (recursive)
 * @param obj Object that may contain sensitive data
 * @returns Scrubbed object safe for logging
 */
export function scrubObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitive types
  if (typeof obj === 'string') {
    return scrubSensitiveData(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => scrubObject(item));
  }

  // Handle objects - create new object to avoid mutation
  const scrubbed: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Specific field names that should always be redacted
    const sensitiveFields = [
      'card_number',
      'cardNumber',
      'number',
      'cvv',
      'cvc',
      'cvv2',
      'cvc2',
      'exp_month',
      'exp_year',
      'expMonth',
      'expYear',
      'pin',
      'password',
      'secret',
      'token',
      'api_key',
      'apiKey',
      'authorization',
      'ssn',
      'account_number',
      'accountNumber',
      'routing_number',
      'routingNumber',
    ];

    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      scrubbed[key] = scrubSensitiveData(value);
    } else {
      scrubbed[key] = scrubObject(value);
    }
  }

  return scrubbed;
}

/**
 * Safe logger that automatically scrubs sensitive data
 * Supports both standard (msg, meta) and pino-style (obj, msg) calling patterns
 */
export class SafeLogger {
  private context: string;

  constructor(context: string = 'Application') {
    this.context = context;
  }

  private formatMessage(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const scrubbed = meta ? scrubObject(meta) : undefined;

    const logEntry = {
      timestamp,
      level,
      context: this.context,
      message: scrubSensitiveData(message),
      ...(scrubbed && { meta: scrubbed }),
    };

    // Use appropriate console method
    switch (level) {
      case 'ERROR':
        console.error(JSON.stringify(logEntry));
        break;
      case 'WARN':
        console.warn(JSON.stringify(logEntry));
        break;
      case 'INFO':
        console.log(JSON.stringify(logEntry));
        break;
      case 'DEBUG':
        console.debug(JSON.stringify(logEntry));
        break;
      default:
        console.log(JSON.stringify(logEntry));
    }
  }

  info(msgOrObj: string | object, metaOrMsg?: any): void {
    if (typeof msgOrObj === 'object') {
      // Pino-style: (obj, msg)
      this.formatMessage('INFO', metaOrMsg || '', msgOrObj);
    } else {
      // Standard: (msg, meta)
      this.formatMessage('INFO', msgOrObj, metaOrMsg);
    }
  }

  warn(msgOrObj: string | object, metaOrMsg?: any): void {
    if (typeof msgOrObj === 'object') {
      this.formatMessage('WARN', metaOrMsg || '', msgOrObj);
    } else {
      this.formatMessage('WARN', msgOrObj, metaOrMsg);
    }
  }

  error(msgOrObj: string | object, metaOrMsg?: any): void {
    if (typeof msgOrObj === 'object') {
      this.formatMessage('ERROR', metaOrMsg || '', msgOrObj);
    } else {
      this.formatMessage('ERROR', msgOrObj, metaOrMsg);
    }
  }

  debug(msgOrObj: string | object, metaOrMsg?: any): void {
    if (typeof msgOrObj === 'object') {
      this.formatMessage('DEBUG', metaOrMsg || '', msgOrObj);
    } else {
      this.formatMessage('DEBUG', msgOrObj, metaOrMsg);
    }
  }
}

/**
 * Mask credit card number for display (show last 4 digits only)
 * @param cardNumber Full card number
 * @returns Masked card number (e.g., "**** **** **** 1234")
 */
export function maskCardNumber(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 4) {
    return '[INVALID_CARD]';
  }

  const last4 = cardNumber.slice(-4);
  return `**** **** **** ${last4}`;
}

/**
 * Create a PCI-compliant log entry for payment processing
 * @param transactionId Transaction identifier
 * @param amount Amount in cents
 * @param status Transaction status
 * @param last4 Last 4 digits of card (already masked)
 */
export function createPaymentLog(
  transactionId: string,
  amount: number,
  status: string,
  last4?: string
): any {
  return {
    transactionId,
    amount,
    status,
    ...(last4 && { cardLast4: last4 }),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fastify middleware to scrub request/response logs
 */
import { FastifyRequest, FastifyReply } from 'fastify';

export async function pciLoggingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Intercept console methods temporarily for this request
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    const scrubbed = args.map(arg =>
      typeof arg === 'object' ? scrubObject(arg) : scrubSensitiveData(String(arg))
    );
    originalLog.apply(console, scrubbed);
  };

  console.error = (...args: any[]) => {
    const scrubbed = args.map(arg =>
      typeof arg === 'object' ? scrubObject(arg) : scrubSensitiveData(String(arg))
    );
    originalError.apply(console, scrubbed);
  };

  console.warn = (...args: any[]) => {
    const scrubbed = args.map(arg =>
      typeof arg === 'object' ? scrubObject(arg) : scrubSensitiveData(String(arg))
    );
    originalWarn.apply(console, scrubbed);
  };

  // Restore original methods when response finishes
  reply.raw.on('finish', () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  });
}

/**
 * Test if a string contains potential PCI data
 * Useful for validation/testing
 */
export function containsPCIData(input: string): boolean {
  if (!input) return false;

  for (const patterns of Object.values(SENSITIVE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return true;
      }
    }
  }

  return false;
}
