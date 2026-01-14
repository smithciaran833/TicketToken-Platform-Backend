// Module declarations for packages without bundled types

declare module '@fastify/cors';
declare module '@fastify/helmet';
declare module '@fastify/rate-limit';
declare module 'bull';
declare module 'crypto-js';
declare module 'express';

declare module 'joi' {
  namespace Joi {
    interface ValidationError extends Error {
      details: Array<{ message: string; path: string[]; type: string }>;
    }
    interface ValidationOptions {
      abortEarly?: boolean;
      allowUnknown?: boolean;
      stripUnknown?: boolean;
      [key: string]: any;
    }
    interface Schema {
      validate(value: any, options?: ValidationOptions): { value: any; error?: ValidationError };
      required(): Schema;
      optional(): Schema;
      [key: string]: any;
    }
  }
  
  interface JoiStatic {
    object(schema?: any): Joi.Schema;
    string(): Joi.Schema;
    number(): Joi.Schema;
    boolean(): Joi.Schema;
    array(): Joi.Schema;
    date(): Joi.Schema;
    any(): Joi.Schema;
    alternatives(): Joi.Schema;
    ref(key: string): any;
    ValidationError: new (...args: any[]) => Joi.ValidationError;
    [key: string]: any;
  }
  
  const Joi: JoiStatic;
  export = Joi;
}

declare module 'winston' {
  namespace winston {
    interface Logger {
      info(message: string | object, meta?: any): void;
      error(message: string | object, meta?: any): void;
      warn(message: string | object, meta?: any): void;
      debug(message: string | object, meta?: any): void;
      log(level: string, message: string, meta?: any): void;
      child(meta: any): Logger;
    }
    type transport = any;
  }
  
  interface WinstonStatic {
    format: {
      combine(...formats: any[]): any;
      timestamp(opts?: any): any;
      printf(fn: (info: any) => string): any;
      colorize(opts?: any): any;
      json(opts?: any): any;
      errors(opts?: any): any;
      metadata(opts?: any): any;
      [key: string]: any;
    };
    transports: {
      Console: new (opts?: any) => any;
      File: new (opts?: any) => any;
    };
    createLogger(opts: any): winston.Logger;
    [key: string]: any;
  }
  
  const winston: WinstonStatic;
  export = winston;
}

declare module 'jsonwebtoken' {
  export function sign(payload: any, secret: string, options?: any): string;
  export function verify(token: string, secret: string, options?: any): any;
  export function decode(token: string, options?: any): any;
  export class TokenExpiredError extends Error {}
  export class JsonWebTokenError extends Error {}
  export class NotBeforeError extends Error {}
  export interface JwtPayload { [key: string]: any; }
  export type Algorithm = 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
  export interface VerifyOptions {
    algorithms?: Algorithm[];
    audience?: string | string[];
    issuer?: string | string[];
    [key: string]: any;
  }
}

declare module 'stripe' {
  class Stripe {
    constructor(apiKey: string, config?: any);
    customers: any;
    paymentIntents: any;
    charges: any;
    refunds: any;
    balance: any;
    balanceTransactions: any;
    subscriptions: any;
    disputes: any;
    products: any;
    prices: any;
    accounts: any;
    webhookEndpoints: any;
    webhooks: { constructEvent(payload: any, sig: string, secret: string): any; };
  }
  namespace Stripe {
    type LatestApiVersion = string;
  }
  export = Stripe;
}

declare module '@aws-sdk/client-kms' {
  export class KMSClient { constructor(config: any); send(command: any): Promise<any>; }
  export class EncryptCommand { constructor(input: any); }
  export class DecryptCommand { constructor(input: any); }
  export class GenerateDataKeyCommand { constructor(input: any); }
}

declare module '@aws-sdk/credential-providers' {
  export function fromEnv(): any;
}

declare module 'uuid' {
  export function v4(): string;
}

declare module 'axios' {
  export interface AxiosInstance {
    get<T = any>(url: string, config?: any): Promise<{ data: T }>;
    post<T = any>(url: string, data?: any, config?: any): Promise<{ data: T }>;
    put<T = any>(url: string, data?: any, config?: any): Promise<{ data: T }>;
    delete<T = any>(url: string, config?: any): Promise<{ data: T }>;
    [key: string]: any;
  }
  interface AxiosStatic extends AxiosInstance {
    create(config?: any): AxiosInstance;
  }
  const axios: AxiosStatic;
  export default axios;
  export { AxiosInstance };
}
