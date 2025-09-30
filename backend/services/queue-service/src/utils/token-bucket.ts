import { logger } from './logger';

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate; // tokens per second
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  
  /**
   * Try to consume tokens from the bucket
   */
  async consume(tokens: number = 1): Promise<boolean> {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }
  
  /**
   * Wait until tokens are available, then consume
   */
  async waitForTokens(tokens: number = 1, maxWaitMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      if (await this.consume(tokens)) {
        return true;
      }
      
      // Calculate wait time until next token
      const msPerToken = 1000 / this.refillRate;
      const waitTime = Math.min(msPerToken * tokens, 100);
      
      await this.sleep(waitTime);
    }
    
    return false; // Timeout
  }
  
  /**
   * Get current token count
   */
  getTokenCount(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
  
  /**
   * Get time until next token (ms)
   */
  getTimeUntilNextToken(): number {
    const msPerToken = 1000 / this.refillRate;
    const tokenDeficit = this.maxTokens - this.tokens;
    
    if (tokenDeficit <= 0) return 0;
    
    return Math.ceil(msPerToken);
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
