/**
 * Order Fee Configuration
 * Centralized configuration for all order-related fees and pricing
 */

export interface FeeConfig {
  platformFeePercent: number;      // Platform fee as a percentage (e.g., 0.05 = 5%)
  processingFeePercent: number;    // Processing fee as a percentage (e.g., 0.029 = 2.9%)
  processingFeeFixed: number;      // Fixed processing fee in cents (e.g., 30 = $0.30)
  taxPercent: number;              // Tax rate as a percentage (e.g., 0.08 = 8%)
  reservationDurationMinutes: number; // How long reservations last
}

/**
 * Default fee configuration
 * Can be overridden by environment variables
 */
const defaultFeeConfig: FeeConfig = {
  platformFeePercent: 0.05,          // 5% platform fee
  processingFeePercent: 0.029,       // 2.9% processing fee (Stripe standard)
  processingFeeFixed: 30,            // $0.30 fixed fee
  taxPercent: 0.08,                  // 8% tax (should be location-based in production)
  reservationDurationMinutes: 30,    // 30 minute reservation window
};

/**
 * Load fee configuration from environment or use defaults
 */
export const feeConfig: FeeConfig = {
  platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || '0.05'),
  processingFeePercent: parseFloat(process.env.PROCESSING_FEE_PERCENT || '0.029'),
  processingFeeFixed: parseInt(process.env.PROCESSING_FEE_FIXED_CENTS || '30', 10),
  taxPercent: parseFloat(process.env.TAX_PERCENT || '0.08'),
  reservationDurationMinutes: parseInt(process.env.RESERVATION_DURATION_MINUTES || '30', 10),
};

/**
 * Calculate order fees
 */
export function calculateOrderFees(subtotalCents: number): {
  platformFeeCents: number;
  processingFeeCents: number;
  taxCents: number;
  totalCents: number;
} {
  const platformFeeCents = Math.floor(subtotalCents * feeConfig.platformFeePercent);
  const processingFeeCents = Math.floor(subtotalCents * feeConfig.processingFeePercent) + feeConfig.processingFeeFixed;
  const taxableCents = subtotalCents + platformFeeCents + processingFeeCents;
  const taxCents = Math.floor(taxableCents * feeConfig.taxPercent);
  const totalCents = subtotalCents + platformFeeCents + processingFeeCents + taxCents;

  return {
    platformFeeCents,
    processingFeeCents,
    taxCents,
    totalCents,
  };
}

/**
 * Validate fee configuration on startup
 */
export function validateFeeConfig(): void {
  if (feeConfig.platformFeePercent < 0 || feeConfig.platformFeePercent > 1) {
    throw new Error('Platform fee percent must be between 0 and 1');
  }
  if (feeConfig.processingFeePercent < 0 || feeConfig.processingFeePercent > 1) {
    throw new Error('Processing fee percent must be between 0 and 1');
  }
  if (feeConfig.processingFeeFixed < 0) {
    throw new Error('Processing fee fixed must be non-negative');
  }
  if (feeConfig.taxPercent < 0 || feeConfig.taxPercent > 1) {
    throw new Error('Tax percent must be between 0 and 1');
  }
  if (feeConfig.reservationDurationMinutes < 1) {
    throw new Error('Reservation duration must be at least 1 minute');
  }
}
