/**
 * Money Handling Utilities
 *
 * CRITICAL: All money must be stored as INTEGER cents in the database.
 * Never use floats or decimals for money calculations.
 *
 * Minor units: $10.50 = 1050 cents
 */

/**
 * Convert dollars to cents (integer minor units)
 * @param dollars - Dollar amount (can be float for input convenience)
 * @returns Integer cents
 */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error('Invalid dollar amount: must be finite number');
  }
  if (dollars < 0) {
    throw new Error('Invalid dollar amount: cannot be negative');
  }
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars for display ONLY
 * Never use this result for calculations!
 * @param cents - Integer cents
 * @returns Dollar amount (float)
 */
export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new Error('Cents must be an integer');
  }
  return cents / 100;
}

/**
 * Add multiple cent amounts safely
 * @param amounts - Array of cent amounts (all must be integers)
 * @returns Sum in cents
 */
export function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, amt) => {
    if (!Number.isInteger(amt)) {
      throw new Error(`All amounts must be integers, got: ${amt}`);
    }
    return sum + amt;
  }, 0);
}

/**
 * Subtract cent amounts safely
 * @param base - Base amount in cents
 * @param subtract - Amount to subtract in cents
 * @returns Difference in cents
 */
export function subtractCents(base: number, subtract: number): number {
  if (!Number.isInteger(base) || !Number.isInteger(subtract)) {
    throw new Error('All amounts must be integers');
  }
  const result = base - subtract;
  if (result < 0) {
    throw new Error('Cannot subtract: result would be negative');
  }
  return result;
}

/**
 * Calculate percentage of amount in cents using basis points
 *
 * Basis points: 10000 = 100%, 250 = 2.5%, 1 = 0.01%
 *
 * Example: 2.5% of $10.50
 *   percentOfCents(1050, 250) = 26 cents
 *
 * @param amountCents - Amount in cents
 * @param basisPoints - Percentage in basis points (1bp = 0.01%)
 * @returns Result in cents (rounded down)
 */
export function percentOfCents(amountCents: number, basisPoints: number): number {
  if (!Number.isInteger(amountCents) || !Number.isInteger(basisPoints)) {
    throw new Error('Values must be integers');
  }
  if (basisPoints < 0 || basisPoints > 10000) {
    throw new Error('Basis points must be between 0 and 10000');
  }
  // Floor to avoid fractional cents
  return Math.floor((amountCents * basisPoints) / 10000);
}

/**
 * Multiply cents by a quantity
 * @param cents - Unit price in cents
 * @param quantity - Quantity (integer)
 * @returns Total in cents
 */
export function multiplyCents(cents: number, quantity: number): number {
  if (!Number.isInteger(cents) || !Number.isInteger(quantity)) {
    throw new Error('Values must be integers');
  }
  return cents * quantity;
}

/**
 * Format cents for display
 * @param cents - Amount in cents
 * @param currency - Currency code (default: USD)
 * @returns Formatted string like "$10.50"
 */
export function formatCents(cents: number, currency = 'USD'): string {
  if (!Number.isInteger(cents)) {
    throw new Error('Cents must be an integer');
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(fromCents(cents));
}

/**
 * Parse money string to cents
 * Handles formats like: "$10.50", "10.50", "10"
 * @param moneyString - Money as string
 * @returns Integer cents
 */
export function parseToCents(moneyString: string): number {
  const cleaned = moneyString.replace(/[$,\s]/g, '');
  const dollars = parseFloat(cleaned);
  if (isNaN(dollars)) {
    throw new Error(`Invalid money string: ${moneyString}`);
  }
  return toCents(dollars);
}
