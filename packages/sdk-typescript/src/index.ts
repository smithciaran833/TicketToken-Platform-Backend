// Main SDK export
export { TicketTokenSDK } from './tickettoken';

// Export types
export type { SDKConfig, ResolvedSDKConfig } from './types/config';
export type {
  Event,
  Ticket,
  User,
  Order,
  CreateEventParams,
  UpdateEventParams,
  TicketTypeParams,
  PurchaseTicketParams,
  TransferTicketParams,
  SearchParams,
  PaginationParams,
  PaginatedResponse,
  APIResponse,
  Analytics,
  WebhookEvent,
} from './types/api';

// Export errors
export {
  TicketTokenError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
} from './errors';

// Export resource classes for advanced usage
export { Events } from './resources/events';
export { Tickets } from './resources/tickets';
export { Users } from './resources/users';

// Export utilities
export { Paginator, paginate } from './utils/pagination';
export { retryWithBackoff, RetryError } from './utils/retry';
export { MemoryCache } from './utils/cache';
export { verifyWebhook, constructWebhookEvent, WebhookVerifier, WebhookSignatureError } from './utils/webhooks';
export { ValidationError as UtilValidationError, validateRequired, validateEmail, validateUrl, validateLength, validateRange, validateEnum, validateArray, validateUuid, validateDate, validateObject } from './utils/validation';
export { RateLimiter, rateLimit, RateLimitError as UtilRateLimitError } from './utils/rate-limiter';

// Export security utilities
export {
  encrypt,
  decrypt,
  generateKey,
  hash,
  sign,
  verify,
  generateNonce,
  generateToken,
  maskSensitiveData,
  sanitizeForLogging,
  isSecureContext,
  validateTokenFormat,
  parseJWT,
  isTokenExpired,
  getTokenExpiration,
  secureCompare
} from './utils/security';

// Export token storage
export {
  TokenStorage,
  MemoryTokenStorage,
  EncryptedLocalStorage,
  SessionStorage,
  CookieStorage,
  createTokenStorage
} from './auth/token-storage';

// Default export (import the class first, then re-export)
import { TicketTokenSDK } from './tickettoken';
export default TicketTokenSDK;
