import * as crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AnonymizationService {
  private static instance: AnonymizationService;
  private log = logger.child({ component: 'AnonymizationService' });
  private dailySalt: string;
  private saltGeneratedAt: Date;

  static getInstance(): AnonymizationService {
    if (!this.instance) {
      this.instance = new AnonymizationService();
    }
    return this.instance;
  }

  constructor() {
    this.dailySalt = this.generateDailySalt();
    this.saltGeneratedAt = new Date();
  }

  private generateDailySalt(): string {
    const date = new Date().toISOString().split('T')[0];
    return crypto
      .createHash('sha256')
      .update(`${config.privacy.customerHashSalt}-${date}`)
      .digest('hex');
  }

  private checkAndUpdateSalt(): void {
    const now = new Date();
    const lastGenerated = new Date(this.saltGeneratedAt);
    
    // Check if we're in a new day
    if (now.getDate() !== lastGenerated.getDate()) {
      this.dailySalt = this.generateDailySalt();
      this.saltGeneratedAt = now;
      this.log.info('Daily salt rotated');
    }
  }

  async hashCustomerId(customerId: string): Promise<string> {
    this.checkAndUpdateSalt();
    
    return crypto
      .createHash('sha256')
      .update(`${customerId}-${this.dailySalt}`)
      .digest('hex')
      .substring(0, 16); // Take first 16 chars for shorter IDs
  }

  async hashEmail(email: string): Promise<string> {
    this.checkAndUpdateSalt();
    
    const normalizedEmail = email.toLowerCase().trim();
    return crypto
      .createHash('sha256')
      .update(`${normalizedEmail}-${this.dailySalt}`)
      .digest('hex');
  }

  anonymizeLocation(location: any): any {
    if (!location) return null;

    return {
      country: location.country,
      region: location.region || location.state,
      // Only keep first 3 digits of postal code
      postalCode: location.postalCode?.substring(0, 3)
    };
  }

  anonymizeDeviceInfo(deviceInfo: any): any {
    if (!deviceInfo) return null;

    return {
      type: deviceInfo.type || 'unknown',
      os: this.generalizeOS(deviceInfo.os),
      browser: this.generalizeBrowser(deviceInfo.browser)
    };
  }

  private generalizeOS(os: string | undefined): string {
    if (!os) return 'unknown';
    
    const osLower = os.toLowerCase();
    if (osLower.includes('windows')) return 'Windows';
    if (osLower.includes('mac') || osLower.includes('darwin')) return 'macOS';
    if (osLower.includes('linux')) return 'Linux';
    if (osLower.includes('android')) return 'Android';
    if (osLower.includes('ios') || osLower.includes('iphone')) return 'iOS';
    
    return 'Other';
  }

  private generalizeBrowser(browser: string | undefined): string {
    if (!browser) return 'unknown';
    
    const browserLower = browser.toLowerCase();
    if (browserLower.includes('chrome')) return 'Chrome';
    if (browserLower.includes('firefox')) return 'Firefox';
    if (browserLower.includes('safari')) return 'Safari';
    if (browserLower.includes('edge')) return 'Edge';
    if (browserLower.includes('opera')) return 'Opera';
    
    return 'Other';
  }

  aggregateAgeGroup(age: number | undefined): string | undefined {
    if (!age) return undefined;
    
    if (age < 18) return 'under-18';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    
    return '65+';
  }

  anonymizeCustomerData(data: any): any {
    const anonymized = { ...data };
    
    // Remove all PII fields
    delete anonymized.firstName;
    delete anonymized.lastName;
    delete anonymized.email;
    delete anonymized.phone;
    delete anonymized.address;
    delete anonymized.dateOfBirth;
    delete anonymized.socialSecurityNumber;
    delete anonymized.creditCard;
    
    // Anonymize remaining fields
    if (anonymized.location) {
      anonymized.location = this.anonymizeLocation(anonymized.location);
    }
    
    if (anonymized.deviceInfo) {
      anonymized.deviceInfo = this.anonymizeDeviceInfo(anonymized.deviceInfo);
    }
    
    if (anonymized.age) {
      anonymized.ageGroup = this.aggregateAgeGroup(anonymized.age);
      delete anonymized.age;
    }
    
    return anonymized;
  }

  generateAnonymousId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}

export const anonymizationService = AnonymizationService.getInstance();
