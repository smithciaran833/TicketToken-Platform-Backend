/**
 * Type declarations for Integration Service
 * 
 * This file provides type augmentations and declarations for external
 * libraries that have incomplete types or need custom extensions.
 */

// =============================================================================
// STRIPE TYPE EXTENSIONS
// =============================================================================

import Stripe from 'stripe';

declare module 'stripe' {
  namespace Stripe {
    // Re-export commonly used types that may not be properly exported
    export type PaymentIntent = Stripe.PaymentIntent;
    export type Charge = Stripe.Charge;
    export type Refund = Stripe.Refund;
    export type RefundCreateParams = Stripe.RefundCreateParams;
    export type Balance = Stripe.Balance;
    export type BalanceTransaction = Stripe.BalanceTransaction;
    export type Event = Stripe.Event;
    export type WebhookEndpoint = Stripe.WebhookEndpoint;
    export type WebhookEndpointCreateParams = Stripe.WebhookEndpointCreateParams;
    export type Subscription = Stripe.Subscription;
    export type SubscriptionUpdateParams = Stripe.SubscriptionUpdateParams;
    export type Dispute = Stripe.Dispute;
    export type DisputeUpdateParams = Stripe.DisputeUpdateParams;
    export type Product = Stripe.Product;
    export type Customer = Stripe.Customer;
    export type Invoice = Stripe.Invoice;
  }
}

// =============================================================================
// AWS KMS EXTENSIONS
// =============================================================================

declare module '@aws-sdk/client-kms' {
  interface EncryptCommandOutput {
    CiphertextBlob?: Uint8Array;
    KeyId?: string;
    EncryptionAlgorithm?: string;
  }

  interface DecryptCommandOutput {
    Plaintext?: Uint8Array;
    KeyId?: string;
    EncryptionAlgorithm?: string;
  }
}

// =============================================================================
// KNEX EXTENSIONS
// =============================================================================

import { Knex } from 'knex';

declare module 'knex' {
  namespace Knex {
    interface QueryBuilder {
      onConflict(columns?: string | string[]): Knex.OnConflictQueryBuilder;
    }

    interface OnConflictQueryBuilder {
      ignore(): Knex.QueryBuilder;
      merge(columns?: string[]): Knex.QueryBuilder;
    }
  }
}

// =============================================================================
// KMS SERVICE TYPES
// =============================================================================

export interface KMSEncryptResult {
  ciphertext: string;
  keyId: string;
  encryptionContext?: Record<string, string>;
}

export interface KMSDecryptResult {
  plaintext: string;
  keyId: string;
}

// =============================================================================
// AXIOS RESPONSE TYPES
// =============================================================================

// Type for OAuth token responses
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

// Type for QuickBooks responses
export interface QuickBooksResponse<T = any> {
  QueryResponse?: {
    [key: string]: T[];
    startPosition?: number;
    maxResults?: number;
  };
  [key: string]: any;
}

// =============================================================================
// FASTIFY SCHEMA EXTENSIONS
// =============================================================================

declare module 'fastify' {
  interface FastifySchema {
    description?: string;
    hide?: boolean;
    summary?: string;
    tags?: string[];
  }
}
