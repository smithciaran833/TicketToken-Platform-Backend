/**
 * Money utility functions
 * All amounts are in INTEGER CENTS
 */

/**
 * Calculate percentage of cents amount
 * @param cents - Amount in cents
 * @param basisPoints - Percentage in basis points (e.g., 700 = 7%)
 * @returns Calculated amount in cents, rounded
 */
export function percentOfCents(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10000);
}

/**
 * Add multiple cent amounts together
 * @param amounts - Variable number of amounts in cents
 * @returns Sum of all amounts
 */
export function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

/**
 * Subtract cents amounts
 * @param minuend - Amount to subtract from
 * @param subtrahend - Amount to subtract
 * @returns Difference in cents
 */
export function subtractCents(minuend: number, subtrahend: number): number {
  return minuend - subtrahend;
}
