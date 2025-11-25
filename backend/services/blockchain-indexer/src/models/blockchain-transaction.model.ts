import { Schema, model, Document } from 'mongoose';

interface IBlockchainTransaction extends Document {
  signature: string;
  slot: number;
  blockTime: number;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  instructions: Array<{
    programId: string;
    accounts: number[];
    data: string;
    parsed?: {
      type: string;
      info: any;
    };
  }>;
  logs: string[];
  fee: number;
  status: 'success' | 'failed';
  errorMessage?: string;
  indexedAt: Date;
}

const BlockchainTransactionSchema = new Schema<IBlockchainTransaction>({
  signature: { type: String, required: true, unique: true, index: true },
  slot: { type: Number, required: true, index: true },
  blockTime: { type: Number, required: true, index: true },
  accounts: [{
    pubkey: { type: String, required: true },
    isSigner: { type: Boolean, required: true },
    isWritable: { type: Boolean, required: true },
  }],
  instructions: [{
    programId: { type: String, required: true },
    accounts: [{ type: Number }],
    data: { type: String, required: true },
    parsed: {
      type: {
        type: String,
        enum: ['purchase_tickets', 'list_ticket', 'buy_listing', 'cancel_listing', 'create_event', 'create_venue'],
      },
      info: { type: Schema.Types.Mixed },
    },
  }],
  logs: [{ type: String }],
  fee: { type: Number, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  errorMessage: { type: String },
  indexedAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
});

BlockchainTransactionSchema.index({ blockTime: -1, slot: -1 });
BlockchainTransactionSchema.index({ 'accounts.pubkey': 1, blockTime: -1 });
BlockchainTransactionSchema.index({ 'instructions.programId': 1, blockTime: -1 });

export const BlockchainTransaction = model<IBlockchainTransaction>('BlockchainTransaction', BlockchainTransactionSchema);
