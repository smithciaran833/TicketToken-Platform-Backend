export interface PaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  customerId: string;
  paymentMethod?: string;
  metadata?: Record<string, any>;
}

export class PaymentRequestValidator {
  static validate(request: PaymentRequest): string[] {
    const errors: string[] = [];

    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!request.currency || request.currency.length !== 3) {
      errors.push('Currency must be a 3-letter ISO code');
    }

    if (!request.orderId) {
      errors.push('Order ID is required');
    }

    if (!request.customerId) {
      errors.push('Customer ID is required');
    }

    // Validate amount doesn't exceed maximum
    if (request.amount > 99999999) {
      errors.push('Amount exceeds maximum allowed');
    }

    // Validate currency is supported
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD'];
    if (request.currency && !supportedCurrencies.includes(request.currency.toUpperCase())) {
      errors.push(`Currency ${request.currency} is not supported`);
    }

    return errors;
  }

  static sanitize(request: PaymentRequest): PaymentRequest {
    return {
      ...request,
      amount: Math.round(request.amount), // Ensure integer for cents
      currency: request.currency.toUpperCase(),
      orderId: request.orderId.trim(),
      customerId: request.customerId.trim()
    };
  }
}
