export interface JobData {
  [key: string]: any;
}

export interface PaymentJobData {
  userId: string;
  venueId: string;
  eventId: string;
  amount: number;
  paymentMethod: string;
  idempotencyKey?: string;
}

export interface EmailJobData {
  to: string;
  template: string;
  data: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}
