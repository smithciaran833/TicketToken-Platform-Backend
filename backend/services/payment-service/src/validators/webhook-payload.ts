export interface WebhookPayload {
  id: string;
  type: string;
  data: any;
  created: number;
}

export class WebhookPayloadValidator {
  static validateStripePayload(payload: any): boolean {
    if (!payload.id || !payload.type || !payload.data) {
      return false;
    }

    // Check required fields based on event type
    if (payload.type.startsWith('payment_intent.')) {
      return this.validatePaymentIntent(payload.data.object);
    }

    if (payload.type.startsWith('charge.')) {
      return this.validateCharge(payload.data.object);
    }

    return true;
  }

  private static validatePaymentIntent(intent: any): boolean {
    return !!(
      intent.id &&
      intent.amount &&
      intent.currency &&
      intent.status
    );
  }

  private static validateCharge(charge: any): boolean {
    return !!(
      charge.id &&
      charge.amount &&
      charge.currency &&
      charge.paid !== undefined
    );
  }

  static validateSquarePayload(payload: any): boolean {
    // Add Square validation when you implement it
    return !!(payload.merchant_id && payload.type && payload.data);
  }
}
