export interface FraudCheck {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  score: number;
  signals: FraudSignal[];
  decision: FraudDecision;
  timestamp: Date;
}

export interface FraudSignal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  details: Record<string, any>;
}

export enum SignalType {
  KNOWN_SCALPER = 'known_scalper',
  RAPID_PURCHASES = 'rapid_purchases',
  MULTIPLE_ACCOUNTS = 'multiple_accounts',
  PROXY_DETECTED = 'proxy_detected',
  SUSPICIOUS_CARD = 'suspicious_card',
  BOT_BEHAVIOR = 'bot_behavior'
}

export enum FraudDecision {
  APPROVE = 'approve',
  REVIEW = 'review',
  CHALLENGE = 'challenge',
  DECLINE = 'decline'
}
