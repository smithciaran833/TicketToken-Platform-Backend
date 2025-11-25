/**
 * Payment Validation Utilities
 * Ensures payment amounts meet business rules and security requirements
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates payment amount is within acceptable limits
 * @param amountCents - Amount in integer cents
 * @throws ValidationError if amount is invalid
 */
export function validatePaymentAmount(amountCents: number): void {
  // Check if amount is a number
  if (typeof amountCents !== 'number' || isNaN(amountCents)) {
    throw new ValidationError(
      'Payment amount must be a valid number',
      'INVALID_AMOUNT_TYPE',
      'amount'
    );
  }

  // Check if amount is an integer (no decimal cents)
  if (!Number.isInteger(amountCents)) {
    throw new ValidationError(
      'Payment amount must be in integer cents (no decimals)',
      'AMOUNT_MUST_BE_INTEGER_CENTS',
      'amount'
    );
  }

  // Minimum payment: $1.00 (100 cents)
  if (amountCents < 100) {
    throw new ValidationError(
      'Payment amount must be at least $1.00 (100 cents)',
      'MINIMUM_PAYMENT_$1',
      'amount'
    );
  }

  // Maximum payment: $1,000,000 (100,000,000 cents)
  // Protection against data entry errors and potential fraud
  if (amountCents > 100000000) {
    throw new ValidationError(
      'Payment amount cannot exceed $1,000,000',
      'MAXIMUM_PAYMENT_$1M',
      'amount'
    );
  }

  // Check for negative amounts
  if (amountCents < 0) {
    throw new ValidationError(
      'Payment amount cannot be negative',
      'NEGATIVE_AMOUNT',
      'amount'
    );
  }

  // Check for zero amount
  if (amountCents === 0) {
    throw new ValidationError(
      'Payment amount cannot be zero',
      'ZERO_AMOUNT',
      'amount'
    );
  }
}

/**
 * Validates ticket count for a purchase
 * @param ticketCount - Number of tickets
 * @throws ValidationError if ticket count is invalid
 */
export function validateTicketCount(ticketCount: number): void {
  if (typeof ticketCount !== 'number' || isNaN(ticketCount)) {
    throw new ValidationError(
      'Ticket count must be a valid number',
      'INVALID_TICKET_COUNT_TYPE',
      'ticketCount'
    );
  }

  if (!Number.isInteger(ticketCount)) {
    throw new ValidationError(
      'Ticket count must be an integer',
      'TICKET_COUNT_MUST_BE_INTEGER',
      'ticketCount'
    );
  }

  if (ticketCount < 1) {
    throw new ValidationError(
      'Ticket count must be at least 1',
      'MINIMUM_TICKET_COUNT',
      'ticketCount'
    );
  }

  // Maximum 100 tickets per transaction (business rule)
  if (ticketCount > 100) {
    throw new ValidationError(
      'Cannot purchase more than 100 tickets in a single transaction',
      'MAXIMUM_TICKET_COUNT_EXCEEDED',
      'ticketCount'
    );
  }
}

/**
 * Validates venue ID format
 * @param venueId - UUID format venue identifier
 * @throws ValidationError if venue ID is invalid
 */
export function validateVenueId(venueId: string): void {
  if (!venueId || typeof venueId !== 'string') {
    throw new ValidationError(
      'Venue ID is required and must be a string',
      'INVALID_VENUE_ID',
      'venueId'
    );
  }

  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(venueId)) {
    throw new ValidationError(
      'Venue ID must be a valid UUID v4',
      'INVALID_VENUE_ID_FORMAT',
      'venueId'
    );
  }
}

/**
 * Sanitize currency code (prevent injection attacks)
 * @param currency - 3-letter currency code
 * @throws ValidationError if currency is invalid
 */
export function validateCurrencyCode(currency: string): void {
  if (!currency || typeof currency !== 'string') {
    throw new ValidationError(
      'Currency code is required',
      'MISSING_CURRENCY',
      'currency'
    );
  }

  // ISO 4217 three-letter currency code
  const currencyRegex = /^[A-Z]{3}$/;
  if (!currencyRegex.test(currency)) {
    throw new ValidationError(
      'Currency must be a valid 3-letter ISO 4217 code (e.g., USD, EUR, GBP)',
      'INVALID_CURRENCY_CODE',
      'currency'
    );
  }

  // Whitelist of supported currencies (for now just USD, expand later)
  const supportedCurrencies = ['USD'];
  if (!supportedCurrencies.includes(currency)) {
    throw new ValidationError(
      `Currency ${currency} is not currently supported. Supported: ${supportedCurrencies.join(', ')}`,
      'UNSUPPORTED_CURRENCY',
      'currency'
    );
  }
}

/**
 * Validates full payment request
 */
export interface PaymentRequest {
  amountCents: number;
  ticketCount: number;
  venueId: string;
  currency?: string;
}

export function validatePaymentRequest(request: PaymentRequest): void {
  validatePaymentAmount(request.amountCents);
  validateTicketCount(request.ticketCount);
  validateVenueId(request.venueId);
  
  if (request.currency) {
    validateCurrencyCode(request.currency);
  }

  // Business rule: Minimum $5 per ticket on average
  const averagePricePerTicket = request.amountCents / request.ticketCount;
  if (averagePricePerTicket < 500) { // $5.00
    throw new ValidationError(
      'Average ticket price cannot be less than $5.00',
      'MINIMUM_TICKET_PRICE',
      'amountCents'
    );
  }

  // Business rule: Maximum $10,000 per ticket
  if (averagePricePerTicket > 1000000) { // $10,000
    throw new ValidationError(
      'Average ticket price cannot exceed $10,000',
      'MAXIMUM_TICKET_PRICE',
      'amountCents'
    );
  }
}

/**
 * Format validation error for API response
 */
export function formatValidationError(error: ValidationError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      field: error.field,
      type: 'validation_error'
    }
  };
}
