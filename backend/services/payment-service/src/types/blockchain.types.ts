export interface NFTMintRequest {
  paymentId: string;
  ticketIds: string[];
  venueId: string;
  eventId: string;
  blockchain: 'solana' | 'polygon';
  priority: 'standard' | 'high' | 'urgent';
}

export interface GasEstimate {
  blockchain: string;
  estimatedFee: number;
  feeInUSD: number;
  congestionLevel: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface MintBatch {
  id: string;
  ticketIds: string[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'collecting';
  transactionHash?: string;
  gasUsed?: number;
  attempts: number;
  error?: string;
}
