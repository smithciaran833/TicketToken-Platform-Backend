// Module declarations for packages without types

declare module 'pg-boss' {
  interface PgBossOptions {
    connectionString?: string;
    database?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    schema?: string;
    application_name?: string;
    max?: number;
    retryLimit?: number;
    retryDelay?: number;
    retryBackoff?: boolean;
    expireInSeconds?: number;
    archiveCompletedAfterSeconds?: number;
    deleteAfterDays?: number;
    monitorStateIntervalMinutes?: number;
    uuid?: string;
  }

  interface JobOptions {
    priority?: number;
    startAfter?: Date | string | number;
    singletonKey?: string;
    singletonSeconds?: number;
    expireInSeconds?: number;
    retryLimit?: number;
    retryDelay?: number;
    retryBackoff?: boolean;
    keepUntil?: Date | string;
  }

  interface Job<T = any> {
    id: string;
    name: string;
    data: T;
    done: (err?: Error, result?: any) => void;
  }

  class PgBoss {
    constructor(options: PgBossOptions | string);
    start(): Promise<PgBoss>;
    stop(): Promise<void>;
    send(name: string, data?: any, options?: JobOptions): Promise<string | null>;
    sendAfter(name: string, data: any, options: JobOptions, date: Date | string | number): Promise<string | null>;
    work<T = any>(name: string, handler: (job: Job<T>) => Promise<any>): Promise<string>;
    work<T = any>(name: string, options: { teamSize?: number; teamConcurrency?: number }, handler: (job: Job<T>) => Promise<any>): Promise<string>;
    fetch<T = any>(name: string): Promise<Job<T> | null>;
    complete(id: string, data?: any): Promise<void>;
    fail(id: string, err?: Error): Promise<void>;
    cancel(id: string): Promise<void>;
    getQueueSize(name: string): Promise<number>;
    deleteQueue(name: string): Promise<void>;
    clearStorage(): Promise<void>;
    on(event: string, handler: (...args: any[]) => void): void;
  }

  export = PgBoss;
}

declare module '@solana/web3.js' {
  export interface ConnectionConfig {
    commitment?: Commitment;
    confirmTransactionInitialTimeout?: number;
    wsEndpoint?: string;
    httpHeaders?: Record<string, string>;
  }

  export class Connection {
    constructor(endpoint: string, commitmentOrConfig?: Commitment | ConnectionConfig);
    getVersion(): Promise<any>;
    getBalance(publicKey: PublicKey): Promise<number>;
    getLatestBlockhash(): Promise<any>;
    sendTransaction(transaction: any, signers: any[]): Promise<string>;
  }

  export class PublicKey {
    constructor(key: string | Buffer | Uint8Array);
    toBase58(): string;
    toString(): string;
    static isOnCurve(key: Uint8Array): boolean;
  }

  export class Keypair {
    publicKey: PublicKey;
    secretKey: Uint8Array;
    static generate(): Keypair;
    static fromSecretKey(secretKey: Uint8Array): Keypair;
  }

  export function clusterApiUrl(cluster: string): string;
  export type Commitment = 'processed' | 'confirmed' | 'finalized';
}

declare module '@metaplex-foundation/js' {
  import { Connection, Keypair, PublicKey } from '@solana/web3.js';

  export class Metaplex {
    constructor(connection: Connection);
    static make(connection: Connection): Metaplex;
    use(plugin: any): Metaplex;
    identity(): { publicKey: PublicKey };
    nfts(): any;
  }

  export function keypairIdentity(keypair: Keypair): any;
}

declare module 'twilio' {
  interface TwilioClient {
    messages: {
      create(options: { body: string; to: string; from: string }): Promise<any>;
    };
  }

  function twilio(accountSid: string, authToken: string): TwilioClient;
  export = twilio;
}

declare module 'joi' {
  export interface ValidationErrorItem {
    message: string;
    path: (string | number)[];
    type: string;
    context?: any;
  }

  export class ValidationError extends Error {
    details: ValidationErrorItem[];
    _original: any;
  }

  export interface ValidationResult<T = any> {
    error?: ValidationError;
    value: T;
  }

  export interface Schema<T = any> {
    validate(value: any, options?: any): ValidationResult<T>;
    validateAsync(value: any, options?: any): Promise<T>;
    required(): this;
    optional(): this;
    valid(...values: any[]): this;
    min(limit: number): this;
    max(limit: number): this;
    default(value: any): this;
    items(schema: Schema): this;
  }

  export interface ObjectSchema<T = any> extends Schema<T> {
    keys(schema: Record<string, Schema>): this;
    required(): this;
    optional(): this;
  }

  export interface Root {
    object(schema?: Record<string, Schema>): ObjectSchema;
    string(): Schema<string>;
    number(): Schema<number>;
    boolean(): Schema<boolean>;
    array(): Schema<any[]>;
    date(): Schema<Date>;
    any(): Schema<any>;
    ValidationError: typeof ValidationError;
  }

  const joi: Root;
  export = joi;
}

declare module 'winston' {
  export interface Logger {
    info(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
    verbose(message: string, meta?: any): void;
  }

  export interface Format {
    combine(...formats: any[]): any;
    timestamp(opts?: any): any;
    printf(fn: (info: any) => string): any;
    colorize(opts?: any): any;
    json(): any;
    simple(): any;
    errors(opts?: any): any;
  }

  export interface Transports {
    Console: new (opts?: any) => any;
    File: new (opts?: any) => any;
  }

  export const format: Format;
  export const transports: Transports;
  export function createLogger(opts: any): Logger;
}

declare module '@fastify/cors';
declare module '@fastify/helmet';
declare module '@fastify/compress';
declare module '@fastify/swagger';
declare module '@fastify/swagger-ui';
