export enum PaymentState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export interface PaymentTransition {
  from: PaymentState;
  to: PaymentState;
  event: string;
  guard?: (context: any) => boolean;
}

export class PaymentStateMachine {
  private transitions: Map<string, PaymentTransition[]> = new Map();
  
  constructor() {
    this.setupTransitions();
  }

  private setupTransitions() {
    // Define valid state transitions
    this.addTransition(PaymentState.PENDING, PaymentState.PROCESSING, 'process');
    this.addTransition(PaymentState.PROCESSING, PaymentState.COMPLETED, 'complete');
    this.addTransition(PaymentState.PROCESSING, PaymentState.FAILED, 'fail');
    this.addTransition(PaymentState.FAILED, PaymentState.PROCESSING, 'retry');
    this.addTransition(PaymentState.COMPLETED, PaymentState.REFUNDED, 'refund');
    this.addTransition(PaymentState.PENDING, PaymentState.CANCELLED, 'cancel');
  }

  private addTransition(from: PaymentState, to: PaymentState, event: string) {
    const key = `${from}-${event}`;
    if (!this.transitions.has(key)) {
      this.transitions.set(key, []);
    }
    this.transitions.get(key)!.push({ from, to, event });
  }

  canTransition(from: PaymentState, event: string): boolean {
    const key = `${from}-${event}`;
    return this.transitions.has(key);
  }

  transition(from: PaymentState, event: string): PaymentState {
    const key = `${from}-${event}`;
    const transitions = this.transitions.get(key);
    if (!transitions || transitions.length === 0) {
      throw new Error(`Invalid transition: ${from} -> ${event}`);
    }
    return transitions[0].to;
  }
}
