import { FastifyRequest, FastifyReply } from 'fastify';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { AwilixContainer } from 'awilix';
import { VenueServiceClient } from '../services/venue-service.client';

// Re-export model interfaces
export {
  IEvent,
  IEventCategory,
  IEventSchedule,
  IEventCapacity,
  IEventPricing,
  IEventMetadata
} from '../models';

// Base types
export interface AppConfig {
  port: number;
  host: string;
  environment: string;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  services: {
    venueServiceUrl: string;
    authServiceUrl: string;
  };
}

export interface Dependencies {
  config: AppConfig;
  db: Knex;
  redis: Redis;
  mongodb?: any;
  venueServiceClient: VenueServiceClient;
  eventContentService: any;
  eventService: any;
  pricingService: any;
  capacityService: any;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
  container: AwilixContainer<Dependencies>;
}

export type AuthenticatedHandler = (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => Promise<any>;

// Legacy Event type for backward compatibility (maps to new IEvent)
export interface Event {
  id: string;
  venue_id: string;
  name: string;
  description?: string;
  event_date: Date;  // Legacy field - maps to first schedule
  doors_open?: Date; // Legacy field - maps to first schedule
  event_type: 'comedy' | 'concert' | 'theater' | 'sports' | 'conference' | 'other';
  status: 'draft' | 'published' | 'soldout' | 'cancelled';
  capacity: number;  // Legacy field - maps to total capacity
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  base_price: number;
  quantity: number;
  max_per_order: number;
  sale_start?: Date;
  sale_end?: Date;
  metadata?: {
    section?: string;
    rows?: string;
    [key: string]: any;
  };
  created_at: Date;
  updated_at: Date;
}

export interface PricingRule {
  id: string;
  tier_id: string;
  rule_type: 'time_based' | 'demand_based' | 'group';
  conditions: Record<string, any>;
  adjustment: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  priority: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any[];
}

// Error classes
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any[];

  constructor(message: string, statusCode: number, code: string, details?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(details: any[]) {
    super('Validation failed', 422, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}
