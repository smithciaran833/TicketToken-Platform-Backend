import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { PaymentMethod, AddPaymentMethodRequest, PaymentMethodType } from '../types/payment-method.types';

export class PaymentMethodService {
  async addPaymentMethod(tenantId: string, userId: string, request: AddPaymentMethodRequest): Promise<PaymentMethod> {
    const db = getDatabase();
    try {
      if (request.setAsDefault) {
        await db.query('UPDATE payment_methods SET is_default = FALSE WHERE tenant_id = $1 AND user_id = $2', [tenantId, userId]);
      }
      const result = await db.query(
        `INSERT INTO payment_methods (tenant_id, user_id, type, provider, token, last_four, card_brand, expiry_month, expiry_year, is_default, billing_address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
        [tenantId, userId, request.type, request.provider, request.token, request.lastFour, request.cardBrand, request.expiryMonth, request.expiryYear, request.setAsDefault || false, JSON.stringify(request.billingAddress || {})]
      );
      return this.mapToPaymentMethod(result.rows[0]);
    } catch (error) {
      logger.error('Error adding payment method', { error, tenantId, userId });
      throw error;
    }
  }

  async listPaymentMethods(tenantId: string, userId: string): Promise<PaymentMethod[]> {
    const db = getDatabase();
    try {
      const result = await db.query(
        'SELECT * FROM payment_methods WHERE tenant_id = $1 AND user_id = $2 ORDER BY is_default DESC, created_at DESC',
        [tenantId, userId]
      );
      return result.rows.map(row => this.mapToPaymentMethod(row));
    } catch (error) {
      logger.error('Error listing payment methods', { error, tenantId, userId });
      throw error;
    }
  }

  async setDefaultPaymentMethod(tenantId: string, userId: string, paymentMethodId: string): Promise<void> {
    const db = getDatabase();
    try {
      await db.query('UPDATE payment_methods SET is_default = FALSE WHERE tenant_id = $1 AND user_id = $2', [tenantId, userId]);
      await db.query('UPDATE payment_methods SET is_default = TRUE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND user_id = $3', [paymentMethodId, tenantId, userId]);
    } catch (error) {
      logger.error('Error setting default payment method', { error, paymentMethodId });
      throw error;
    }
  }

  async deletePaymentMethod(tenantId: string, userId: string, paymentMethodId: string): Promise<void> {
    const db = getDatabase();
    try {
      await db.query('DELETE FROM payment_methods WHERE id = $1 AND tenant_id = $2 AND user_id = $3', [paymentMethodId, tenantId, userId]);
    } catch (error) {
      logger.error('Error deleting payment method', { error, paymentMethodId });
      throw error;
    }
  }

  private mapToPaymentMethod(row: any): PaymentMethod {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      type: row.type,
      provider: row.provider,
      token: row.token,
      lastFour: row.last_four,
      cardBrand: row.card_brand,
      expiryMonth: row.expiry_month,
      expiryYear: row.expiry_year,
      isDefault: row.is_default,
      isVerified: row.is_verified,
      isExpired: row.is_expired,
      billingAddress: row.billing_address,
      metadata: row.metadata,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const paymentMethodService = new PaymentMethodService();
