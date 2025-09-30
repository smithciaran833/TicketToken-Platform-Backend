import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';

// Base route generics
export interface VenueRouteGeneric extends RouteGenericInterface {
  Params: {
    venueId: string;
  };
}

export interface VenueQueryRouteGeneric extends VenueRouteGeneric {
  Querystring: {
    [key: string]: any;
  };
}

export interface VenueBodyRouteGeneric<T = any> extends VenueRouteGeneric {
  Body: T;
}

export interface VenueQueryBodyRouteGeneric<Q = any, B = any> extends VenueRouteGeneric {
  Querystring: Q;
  Body: B;
}

// Analytics specific
export interface AnalyticsQuery {
  start_date?: string;
  end_date?: string;
  [key: string]: any;
}

export interface AnalyticsRouteGeneric extends VenueRouteGeneric {
  Querystring: AnalyticsQuery;
}

export interface AnalyticsExportRouteGeneric extends VenueRouteGeneric {
  Body: {
    format: 'csv' | 'json';
  };
}

// Type helpers
export type VenueRequest<T extends RouteGenericInterface = VenueRouteGeneric> = FastifyRequest<T>;
export type VenueReply = FastifyReply;
