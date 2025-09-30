import { db } from './database.service';

interface StateRule {
  maxMarkup: number | null;
  requiresDisclosure: boolean;
  requiresLicense: boolean;
  specialRules: string[];
}

export class StateComplianceService {
  private stateRules: Record<string, StateRule> = {
    'TN': {
      maxMarkup: 0.20, // Tennessee limits markup to 20% over face value
      requiresDisclosure: true,
      requiresLicense: false,
      specialRules: ['No sales within 200ft of venue']
    },
    'TX': {
      maxMarkup: null, // No limit
      requiresDisclosure: true,
      requiresLicense: true, // Texas requires license for resale
      specialRules: ['Must display original price']
    }
  };

  async validateResale(state: string, originalPrice: number, resalePrice: number): Promise<{
    allowed: boolean;
    reason?: string;
    maxAllowedPrice?: number;
  }> {
    const rules = this.stateRules[state];

    if (!rules) {
      return { allowed: true }; // No restrictions for this state
    }

    if (rules.maxMarkup !== null) {
      const maxPrice = originalPrice * (1 + rules.maxMarkup);
      if (resalePrice > maxPrice) {
        return {
          allowed: false,
          reason: `${state} limits markup to ${rules.maxMarkup * 100}%`,
          maxAllowedPrice: maxPrice
        };
      }
    }

    return { allowed: true };
  }

  async checkLicenseRequirement(state: string): Promise<boolean> {
    return this.stateRules[state]?.requiresLicense || false;
  }

  async loadFromDatabase(): Promise<void> {
    const result = await db.query('SELECT * FROM state_compliance_rules');
    
    for (const row of result.rows) {
      this.stateRules[row.state_code] = {
        maxMarkup: row.max_markup_percentage ? row.max_markup_percentage / 100 : null,
        requiresDisclosure: row.requires_disclosure,
        requiresLicense: row.requires_license,
        specialRules: row.special_rules?.rules || []
      };
    }
  }
}

export const stateComplianceService = new StateComplianceService();
