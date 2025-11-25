export enum PaymentMethodType {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  PAYPAL = 'PAYPAL',
  APPLE_PAY = 'APPLE_PAY',
  GOOGLE_PAY = 'GOOGLE_PAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum PaymentAttemptStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface PaymentMethod {
  id: string;
  tenantId: string;
  userId: string;
  type: PaymentMethodType;
  provider: string;
  token: string;
  lastFour?: string;
  cardBrand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  isVerified: boolean;
  isExpired: boolean;
  billingAddress?: Record<string, any>;
  metadata?: Record<string, any>;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentAttempt {
  id: string;
  orderId: string;
  paymentMethodId?: string;
  tenantId: string;
  attemptNumber: number;
  status: PaymentAttemptStatus;
  amountCents: number;
  provider: string;
  providerTransactionId?: string;
  providerResponse?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  attemptedAt: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface AddPaymentMethodRequest {
  type: PaymentMethodType;
  provider: string;
  token: string;
  lastFour?: string;
  cardBrand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  billingAddress?: Record<string, any>;
  setAsDefault?: boolean;
}

export interface ProcessPaymentRequest {
  orderId: string;
  paymentMethodId?: string;
  amountCents: number;
  provider?: string;
}
