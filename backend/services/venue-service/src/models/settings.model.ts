import { Knex } from "knex";
import { BaseModel } from './base.model';

export interface IVenueSettings {
  general?: {
    timezone?: string;
    currency?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
  };
  ticketing?: {
    allowRefunds?: boolean;
    refundWindow?: number; // hours
    maxTicketsPerOrder?: number;
    requirePhoneNumber?: boolean;
    enableWaitlist?: boolean;
    transferDeadline?: number; // hours before event
  };
  notifications?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    webhookUrl?: string;
    notifyOnPurchase?: boolean;
    notifyOnRefund?: boolean;
    dailyReportEnabled?: boolean;
  };
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logo?: string;
    emailFooter?: string;
    customDomain?: string;
  };
  payment?: {
    currency?: string;
    taxRate?: number;
    includeTaxInPrice?: boolean;
    paymentMethods?: string[];
  };
  features?: {
    nftEnabled?: boolean;
    qrCodeEnabled?: boolean;
    seasonPassEnabled?: boolean;
    groupDiscountsEnabled?: boolean;
  };
}

export class SettingsModel {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getVenueSettings(venueId: string): Promise<IVenueSettings> {
    const venue = await this.db('venues')
      .where({ id: venueId })
      .whereNull('deleted_at')
      .select('settings')
      .first();

    return venue?.settings || this.getDefaultSettings();
  }

  async updateVenueSettings(venueId: string, settings: Partial<IVenueSettings>): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    const newSettings = this.mergeSettings(currentSettings, settings);

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: newSettings,
        updated_at: new Date(),
      });

    return newSettings;
  }

  async updateSettingSection(
    venueId: string, 
    section: keyof IVenueSettings, 
    sectionSettings: any
  ): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    currentSettings[section] = {
      ...currentSettings[section],
      ...sectionSettings,
    };

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: currentSettings,
        updated_at: new Date(),
      });

    return currentSettings;
  }

  getDefaultSettings(): IVenueSettings {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
        enableWaitlist: false,
        transferDeadline: 2,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookUrl: undefined,
        notifyOnPurchase: true,
        notifyOnRefund: true,
        dailyReportEnabled: false,
      },
      branding: {
        primaryColor: '#000000',
        secondaryColor: '#666666',
        logo: undefined,
        emailFooter: undefined,
        customDomain: undefined,
      },
      payment: {
        currency: 'USD',
        taxRate: 0,
        includeTaxInPrice: false,
        paymentMethods: ['card'],
      },
      features: {
        nftEnabled: true,
        qrCodeEnabled: true,
        seasonPassEnabled: false,
        groupDiscountsEnabled: false,
      },
    };
  }

  private mergeSettings(current: IVenueSettings, updates: Partial<IVenueSettings>): IVenueSettings {
    const merged = { ...current };

    for (const [section, sectionUpdates] of Object.entries(updates)) {
      if (sectionUpdates && typeof sectionUpdates === 'object') {
        merged[section as keyof IVenueSettings] = {
          ...current[section as keyof IVenueSettings],
          ...sectionUpdates,
        };
      }
    }

    return merged;
  }

  async validateSettings(settings: IVenueSettings): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate timezone
    if (settings.general?.timezone) {
      // TODO: Validate against timezone list
    }

    // Validate currency
    if (settings.general?.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(settings.general.currency)) {
        errors.push('Invalid currency code');
      }
    }

    // Validate colors
    if (settings.branding?.primaryColor) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      if (!hexRegex.test(settings.branding.primaryColor)) {
        errors.push('Invalid primary color format');
      }
    }

    // Validate webhook URL
    if (settings.notifications?.webhookUrl) {
      try {
        new URL(settings.notifications.webhookUrl);
      } catch {
        errors.push('Invalid webhook URL');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
