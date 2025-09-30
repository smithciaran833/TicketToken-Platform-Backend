export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  metadata?: Record<string, any>;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimeGranularity {
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  value: number;
}

export interface VenueContext {
  venueId: string;
  tenantId?: string;
}

export interface UserContext {
  userId: string;
  venueId?: string;
  permissions: string[];
  role?: string;
}

export interface AuditInfo {
  createdAt: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export enum MetricType {
  SALES = 'sales',
  REVENUE = 'revenue',
  ATTENDANCE = 'attendance',
  CAPACITY = 'capacity',
  CONVERSION = 'conversion',
  CART_ABANDONMENT = 'cart_abandonment',
  AVERAGE_ORDER_VALUE = 'average_order_value',
  CUSTOMER_LIFETIME_VALUE = 'customer_lifetime_value',
}

export enum EventType {
  // Ticket events
  TICKET_PURCHASED = 'ticket.purchased',
  TICKET_TRANSFERRED = 'ticket.transferred',
  TICKET_REFUNDED = 'ticket.refunded',
  TICKET_SCANNED = 'ticket.scanned',
  
  // Venue events
  VENUE_CREATED = 'venue.created',
  VENUE_UPDATED = 'venue.updated',
  EVENT_CREATED = 'event.created',
  EVENT_UPDATED = 'event.updated',
  EVENT_CANCELLED = 'event.cancelled',
  
  // Payment events
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  REFUND_PROCESSED = 'refund.processed',
  
  // Marketplace events
  LISTING_CREATED = 'listing.created',
  LISTING_SOLD = 'listing.sold',
  OFFER_MADE = 'offer.made',
  
  // User events
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  USER_PROFILE_UPDATED = 'user.profile_updated',
}
