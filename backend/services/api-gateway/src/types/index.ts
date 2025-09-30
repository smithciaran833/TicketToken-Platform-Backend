// User and authentication types
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;  // Added for multi-tenancy support
  permissions: string[];
  venueId?: string;
  metadata?: Record<string, any>;
}

export type UserRole =
  | 'venue-owner'
  | 'venue-manager'
  | 'box-office'
  | 'door-staff'
  | 'customer'
  | 'admin';

export interface VenueContext {
  venueId: string;
  userId: string;
  role: UserRole;
  permissions: string[];
}

// Service types
export interface ServiceContainer {
  proxyService: ProxyService;
  circuitBreakerService: CircuitBreakerService;
  loadBalancerService: LoadBalancerService;
  serviceDiscoveryService: ServiceDiscoveryService;
  aggregatorService: AggregatorService;
  retryService: RetryService;
  timeoutService: TimeoutService;
}

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  healthy: boolean;
  metadata?: Record<string, any>;
}

export interface ProxyService {
  forward(request: any, service: string, options?: ProxyOptions): Promise<any>;
}

export interface ProxyOptions {
  timeout?: number;
  retries?: number;
  circuitBreaker?: boolean;
  fallback?: any;
}

export interface CircuitBreakerService {
  execute<T>(name: string, fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
  getState(name: string): CircuitBreakerState;
  getAllStats(): Record<string, any>;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface LoadBalancerService {
  selectInstance(service: string, instances: ServiceInstance[], strategy?: LoadBalancerStrategy): ServiceInstance;
}

export type LoadBalancerStrategy = 'round-robin' | 'least-connections' | 'random' | 'consistent-hash';

export interface ServiceDiscoveryService {
  discover(serviceName: string): Promise<ServiceInstance[]>;
  register(service: ServiceInstance): Promise<void>;
  deregister(serviceId: string): Promise<void>;
  getHealthyInstances(serviceName: string): Promise<ServiceInstance[]>;
  getServiceTopology(): Promise<Record<string, ServiceInstance[]>>;
}

export interface AggregatorService {
  aggregate(dataSources: DataSource[], request: any): Promise<any>;
  getEventDetails(eventId: string, request: any): Promise<any>;
  getUserDashboard(userId: string, request: any): Promise<any>;
}

export interface DataSource {
  name: string;
  service: string;
  endpoint: string;
  required: boolean;
  transform?: (data: any) => any;
  fallback?: any;
}

export interface RetryService {
  executeWithRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  multiplier?: number;
  jitter?: boolean;
  retryableErrors?: string[];
}

export interface TimeoutService {
  executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T>;
}

export interface TimeoutBudget {
  total: number;
  remaining: number;
  deadlineMs: number;
}

// Rate limiting types
export interface RateLimitConfig {
  max: number;
  timeWindow: number;
  blockDuration?: number;
  keyGenerator?: (request: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// Error types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(422, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(401, message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super(429, 'Too many requests', 'RATE_LIMIT_ERROR', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(service: string) {
    super(503, `Service unavailable: ${service}`, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

// Request/Response types
export interface PaginationQuery {
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset?: number;
    total?: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

// Venue types
export interface Venue {
  id: string;
  name: string;
  tier: 'free' | 'standard' | 'premium';
  settings: VenueSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface VenueSettings {
  timezone: string;
  currency: string;
  features: {
    nftEnabled: boolean;
    marketplaceEnabled: boolean;
    analyticsEnabled: boolean;
  };
}

// Event types
export interface Event {
  id: string;
  venueId: string;
  name: string;
  date: Date;
  status: 'draft' | 'published' | 'sold_out' | 'cancelled';
  ticketTypes: TicketType[];
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
}

// Ticket types
export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  status: 'available' | 'reserved' | 'sold' | 'used';
  nftTokenId?: string;
  nftContractAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Monitoring types
export interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    database?: 'ok' | 'error';
    redis?: 'ok' | 'error';
    services?: Record<string, 'ok' | 'error'>;
  };
}

export interface Metrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  activeConnections: number;
  queueDepth: Record<string, number>;
}
