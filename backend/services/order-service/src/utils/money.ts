/**
 * Convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as currency string
 */
export function formatCents(cents: number, currency = 'USD'): string {
  const dollars = centsToDollars(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(dollars);
}

/**
 * Calculate percentage of amount
 */
export function calculatePercentage(amount: number, percentage: number): number {
  return Math.round((amount * percentage) / 100);
}

/**
 * Add fixed fee to amount
 */
export function addFixedFee(amount: number, fixedFeeCents: number): number {
  return amount + fixedFeeCents;
}
