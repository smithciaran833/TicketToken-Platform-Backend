/**
 * Common pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Standard API response
 */
export interface APIResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

/**
 * Event object
 */
export interface Event {
  id: string;
  name: string;
  description: string;
  venue: string;
  location: string;
  startDate: string;
  endDate: string;
  capacity: number;
  availableTickets: number;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  images: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ticket object
 */
export interface Ticket {
  id: string;
  eventId: string;
  ticketType: string;
  price: number;
  currency: string;
  owner: string;
  status: 'available' | 'sold' | 'transferred' | 'used' | 'cancelled';
  nftMint?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * User object
 */
export interface User {
  id: string;
  email: string;
  name: string;
  walletAddress?: string;
  role: 'user' | 'organizer' | 'admin';
  verified: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Order object
 */
export interface Order {
  id: string;
  userId: string;
  eventId: string;
  tickets: Ticket[];
  totalAmount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod: string;
  paymentId?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create event parameters
 */
export interface CreateEventParams {
  name: string;
  description: string;
  venue: string;
  location: string;
  startDate: string;
  endDate: string;
  capacity: number;
  ticketTypes: TicketTypeParams[];
  images?: string[];
  metadata?: Record<string, any>;
}

/**
 * Update event parameters
 */
export interface UpdateEventParams extends Partial<CreateEventParams> {
  status?: 'draft' | 'published' | 'cancelled' | 'completed';
}

/**
 * Ticket type parameters
 */
export interface TicketTypeParams {
  name: string;
  price: number;
  currency: string;
  quantity: number;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Purchase ticket parameters
 */
export interface PurchaseTicketParams {
  eventId: string;
  ticketType: string;
  quantity: number;
  paymentMethod: string;
  metadata?: Record<string, any>;
}

/**
 * Transfer ticket parameters
 */
export interface TransferTicketParams {
  ticketId: string;
  recipientAddress: string;
  metadata?: Record<string, any>;
}

/**
 * Search parameters
 */
export interface SearchParams extends PaginationParams {
  query?: string;
  filters?: Record<string, any>;
  startDate?: string;
  endDate?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Analytics data
 */
export interface Analytics {
  totalSales: number;
  totalRevenue: number;
  ticketsSold: number;
  revenueByDate: Array<{
    date: string;
    revenue: number;
  }>;
  topEvents: Array<{
    eventId: string;
    name: string;
    revenue: number;
    ticketsSold: number;
  }>;
}

/**
 * Webhook event
 */
export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  timestamp: string;
  signature: string;
}
