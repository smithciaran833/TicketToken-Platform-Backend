export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  provider: 'stripe' | 'paypal' | 'solana';
  createdAt: Date;
  updatedAt: Date;
}
