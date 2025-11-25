import { Schema, model, Document } from 'mongoose';

interface INFTMetadata extends Document {
  assetId: string;
  tree: string;
  leafIndex: number;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    sellerFeeBasisPoints: number;
    creators: Array<{
      address: string;
      share: number;
      verified: boolean;
    }>;
  };
  merkleProof: string[];
  owner: string;
  delegate?: string;
  compressed: boolean;
  eventId?: string;
  ticketNumber?: number;
  mintedAt: Date;
}

const NFTMetadataSchema = new Schema<INFTMetadata>({
  assetId: { type: String, required: true, unique: true, index: true },
  tree: { type: String, required: true, index: true },
  leafIndex: { type: Number, required: true },
  metadata: {
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    uri: { type: String, required: true },
    sellerFeeBasisPoints: { type: Number, required: true },
    creators: [{
      address: { type: String, required: true },
      share: { type: Number, required: true },
      verified: { type: Boolean, required: true },
    }],
  },
  merkleProof: [{ type: String }],
  owner: { type: String, required: true, index: true },
  delegate: { type: String, index: true },
  compressed: { type: Boolean, default: true },
  eventId: { type: String, index: true },
  ticketNumber: { type: Number },
  mintedAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
});

NFTMetadataSchema.index({ eventId: 1, ticketNumber: 1 });
NFTMetadataSchema.index({ owner: 1, mintedAt: -1 });
NFTMetadataSchema.index({ tree: 1, leafIndex: 1 }, { unique: true });

export const NFTMetadata = model<INFTMetadata>('NFTMetadata', NFTMetadataSchema);
