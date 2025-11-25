import { Schema, model, Document } from 'mongoose';

interface IMarketplaceEvent extends Document {
  eventType: 'sale' | 'listing' | 'delisting' | 'price_change';
  marketplace: 'magic_eden' | 'tensor' | 'solanart' | 'tickettoken' | 'other';
  signature: string;
  tokenId: string;
  price: number;
  seller: string;
  buyer?: string;
  royaltiesPaid: Array<{
    recipient: string;
    amount: number;
  }>;
  marketplaceFee?: number;
  timestamp: Date;
}

const MarketplaceEventSchema = new Schema<IMarketplaceEvent>({
  eventType: { 
    type: String, 
    enum: ['sale', 'listing', 'delisting', 'price_change'], 
    required: true,
    index: true,
  },
  marketplace: { 
    type: String, 
    enum: ['magic_eden', 'tensor', 'solanart', 'tickettoken', 'other'], 
    required: true,
    index: true,
  },
  signature: { type: String, required: true, unique: true, index: true },
  tokenId: { type: String, required: true, index: true },
  price: { type: Number, required: true },
  seller: { type: String, required: true, index: true },
  buyer: { type: String, index: true },
  royaltiesPaid: [{
    recipient: { type: String, required: true },
    amount: { type: Number, required: true },
  }],
  marketplaceFee: { type: Number },
  timestamp: { type: Date, required: true, index: true },
}, {
  timestamps: true,
});

MarketplaceEventSchema.index({ tokenId: 1, timestamp: -1 });
MarketplaceEventSchema.index({ marketplace: 1, eventType: 1, timestamp: -1 });
MarketplaceEventSchema.index({ seller: 1, timestamp: -1 });
MarketplaceEventSchema.index({ buyer: 1, timestamp: -1 });

export const MarketplaceEvent = model<IMarketplaceEvent>('MarketplaceEvent', MarketplaceEventSchema);
