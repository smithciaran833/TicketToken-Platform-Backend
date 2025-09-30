import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      // Add other user properties as needed
    };
  }
}

export interface RouteGenericVenue {
  Params: {
    venueId: string;
  };
}

export interface RouteGenericVenueWithQuery extends RouteGenericVenue {
  Querystring: {
    [key: string]: any;
  };
}

export interface RouteGenericVenueWithBody<T = any> extends RouteGenericVenue {
  Body: T;
}
