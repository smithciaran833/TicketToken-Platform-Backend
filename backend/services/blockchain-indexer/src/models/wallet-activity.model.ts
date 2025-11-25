import { Schema, model, Document } from 'mongoose';

interface IWalletActivity extends Document {
  walletAddress: string;
  activityType: 'purchase' | 'sale' | 'transfer' | 'mint' | 'burn' | 'listing';
  eventId?: string;
  ticketId?: string;
  assetId?: string;
  transactionSignature: string;
  amount?: number;
  fromAddress?: string;
  toAddress?: string;
  timestamp: Date;
}

const WalletActivitySchema = new Schema<IWalletActivity>({
  walletAddress: { type: String, required: true, index: true },
  activityType: { 
    type: String, 
    enum: ['purchase', 'sale', 'transfer', 'mint', 'burn', 'listing'], 
    required: true,
    index: true,
  },
  eventId: { type: String, index: true },
  ticketId: { type: String, index: true },
  assetId: { type: String, index: true },
  transactionSignature: { type: String, required: true, index: true },
  amount: { type: Number },
  fromAddress: { type: String },
  toAddress: { type: String },
  timestamp: { type: Date, required: true, index: true },
}, {
  timestamps: true,
});

WalletActivitySchema.index({ walletAddress: 1, timestamp: -1 });
WalletActivitySchema.index({ walletAddress: 1, activityType: 1, timestamp: -1 });
WalletActivitySchema.index({ eventId: 1, timestamp: -1 });

export const WalletActivity = model<IWalletActivity>('WalletActivity', WalletActivitySchema);
