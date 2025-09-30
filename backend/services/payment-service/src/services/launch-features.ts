// IP Geolocation Service
export class IPGeolocationService {
  // Mock for dev, replace with real API in production
  async getLocation(ip: string) {
    // In production: use ipapi.co or similar
    const mockLocations: Record<string, any> = {
      '0.0.0.0': { country: 'US', city: 'Nashville', risk: 'low' },
      '192.168.1.1': { country: 'US', city: 'Memphis', risk: 'low' }
    };

    return mockLocations[ip] || {
      country: 'US',
      city: 'Unknown',
      risk: 'medium',
      mockData: true
    };
  }

  isHighRiskCountry(country: string): boolean {
    const highRiskCountries = ['XX', 'YY']; // Add real ones later
    return highRiskCountries.includes(country);
  }
}

// Device Fingerprinting
export class DeviceFingerprintService {
  generateFingerprint(deviceData: any): string {
    // Simple version for launch
    const data = `${deviceData.userAgent}_${deviceData.screenResolution}_${deviceData.timezone}`;
    return Buffer.from(data).toString('base64').substring(0, 16);
  }

  async checkDevice(fingerprint: string): Promise<any> {
    // In production: check database
    return {
      trusted: true,
      previousUses: Math.floor(Math.random() * 5),
      mockData: true
    };
  }
}

// Blacklist Service
export class BlacklistService {
  private blacklists = {
    users: new Set<string>(),
    emails: new Set<string>(),
    ips: new Set<string>(),
    cards: new Set<string>()
  };

  async checkBlacklists(data: {
    userId?: string,
    email?: string,
    ip?: string,
    cardLast4?: string
  }): Promise<{blocked: boolean, reason?: string}> {
    if (data.userId && this.blacklists.users.has(data.userId)) {
      return { blocked: true, reason: 'User blacklisted' };
    }
    if (data.email && this.blacklists.emails.has(data.email)) {
      return { blocked: true, reason: 'Email blacklisted' };
    }
    if (data.ip && this.blacklists.ips.has(data.ip)) {
      return { blocked: true, reason: 'IP blacklisted' };
    }
    return { blocked: false };
  }

  addToBlacklist(type: 'user' | 'email' | 'ip' | 'card', value: string) {
    switch(type) {
      case 'user': this.blacklists.users.add(value); break;
      case 'email': this.blacklists.emails.add(value); break;
      case 'ip': this.blacklists.ips.add(value); break;
      case 'card': this.blacklists.cards.add(value); break;
    }
  }
}

// Venue Subscription Plans
export class VenueSubscriptionService {
  private plans = {
    starter: {
      id: 'starter',
      name: 'Starter',
      price: 99,
      features: ['Up to 100 tickets/month', 'Basic analytics', 'Email support'],
      feePercentage: 8.2
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: 499,
      features: ['Up to 1000 tickets/month', 'Advanced analytics', 'Priority support'],
      feePercentage: 7.9
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      price: 999,
      features: ['Unlimited tickets', 'Custom analytics', 'Dedicated support'],
      feePercentage: 7.5
    }
  };

  getPlans() {
    return Object.values(this.plans);
  }

  async subscribeVenue(venueId: string, planId: string) {
    const plan = this.plans[planId as keyof typeof this.plans];
    if (!plan) throw new Error('Invalid plan');

    // In production: Create Stripe subscription
    return {
      subscriptionId: `sub_${Date.now()}`,
      venueId,
      plan,
      status: 'active',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
  }

  getFeePercentage(planId: string): number {
    const plan = this.plans[planId as keyof typeof this.plans];
    return plan?.feePercentage || 8.2;
  }
}

// Multi-currency Support with integer-based math to prevent drift
export class CurrencyService {
  // Store rates as integers (multiplied by 10000 for 4 decimal precision)
  // This prevents floating point drift in currency calculations
  private ratesInCents = {
    USD: 10000,  // 1.0000 * 10000
    EUR: 8500,   // 0.8500 * 10000
    GBP: 7300,   // 0.7300 * 10000
    CAD: 12500   // 1.2500 * 10000
  };

  async convert(amount: number, from: string, to: string): Promise<number> {
    // Convert amount to cents (integer) to avoid float precision issues
    const amountInCents = Math.round(amount * 100);
    
    // Get rates as integers
    const fromRate = this.ratesInCents[from as keyof typeof this.ratesInCents];
    const toRate = this.ratesInCents[to as keyof typeof this.ratesInCents];
    
    if (!fromRate || !toRate) {
      throw new Error(`Unsupported currency: ${!fromRate ? from : to}`);
    }
    
    // Convert to USD base (all calculations in integers)
    // amountInCents * 10000 / fromRate gives us USD cents * 10000 / rate
    const usdCentsTimesBase = (amountInCents * 10000) / fromRate;
    
    // Convert from USD to target currency
    // usdCents * toRate / 10000 gives us target currency in cents
    const targetCents = Math.round((usdCentsTimesBase * toRate) / 10000);
    
    // Convert back to dollars (2 decimal places)
    return targetCents / 100;
  }

  // Helper method to convert with explicit rounding for display
  async convertForDisplay(amount: number, from: string, to: string): Promise<string> {
    const converted = await this.convert(amount, from, to);
    // Ensure exactly 2 decimal places for display
    return converted.toFixed(2);
  }

  getSupportedCurrencies() {
    return Object.keys(this.ratesInCents);
  }

  // Get exchange rate between two currencies (for display purposes)
  getExchangeRate(from: string, to: string): number {
    const fromRate = this.ratesInCents[from as keyof typeof this.ratesInCents];
    const toRate = this.ratesInCents[to as keyof typeof this.ratesInCents];
    
    if (!fromRate || !toRate) {
      throw new Error(`Unsupported currency: ${!fromRate ? from : to}`);
    }
    
    // Calculate rate with 4 decimal precision
    return Math.round((toRate / fromRate) * 10000) / 10000;
  }
}

// Instant Payout Service
export class InstantPayoutService {
  async requestPayout(venueId: string, amount: number, instant: boolean = false) {
    // Use integer math for fee calculation
    const amountInCents = Math.round(amount * 100);
    const feeCents = instant ? Math.round(amountInCents * 0.01) : 0; // 1% fee for instant
    const netAmountCents = amountInCents - feeCents;

    return {
      payoutId: `po_${Date.now()}`,
      venueId,
      amount: netAmountCents / 100,
      fee: feeCents / 100,
      type: instant ? 'instant' : 'standard',
      estimatedArrival: instant ? 'Within 30 minutes' : '1-2 business days',
      status: 'processing'
    };
  }
}
