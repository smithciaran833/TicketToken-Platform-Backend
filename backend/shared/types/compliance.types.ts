export interface VenueVerification {
  venueId: string;
  ein: string;
  businessName: string;
  status: 'pending' | 'verified' | 'rejected' | 'requires_review';
  w9Uploaded: boolean;
  bankVerified: boolean;
  ofacCleared: boolean;
  riskScore: number;
}

export interface TaxRecord {
  venueId: string;
  year: number;
  totalSales: number;
  thresholdReached: boolean;
  form1099Required: boolean;
  form1099Sent: boolean;
}

export interface OFACCheck {
  name: string;
  isMatch: boolean;
  confidence: number;
  checkedAt: Date;
}

export interface RiskFlags {
  highVelocity: boolean;
  suspiciousPattern: boolean;
  blacklisted: boolean;
  score: number; // 0-100
}
