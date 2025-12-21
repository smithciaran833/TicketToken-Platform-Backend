import { Knex } from "knex";

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
    refundWindow?: number;
    maxTicketsPerOrder?: number;
    requirePhoneNumber?: boolean;
    enableWaitlist?: boolean;
    transferDeadline?: number;
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

/**
 * SettingsModel - uses venue_settings table (not venues.settings column)
 */
export class SettingsModel {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async getVenueSettings(venueId: string): Promise<IVenueSettings> {
    const row = await this.db('venue_settings')
      .where({ venue_id: venueId })
      .first();

    if (!row) {
      return this.getDefaultSettings();
    }

    return this.rowToSettings(row);
  }

  async updateVenueSettings(venueId: string, settings: Partial<IVenueSettings>): Promise<IVenueSettings> {
    const existing = await this.db('venue_settings')
      .where({ venue_id: venueId })
      .first();

    const rowData = this.settingsToRow(settings);

    if (existing) {
      await this.db('venue_settings')
        .where({ venue_id: venueId })
        .update({
          ...rowData,
          updated_at: new Date()
        });
    } else {
      await this.db('venue_settings')
        .insert({
          venue_id: venueId,
          ...rowData
        });
    }

    return this.getVenueSettings(venueId);
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

    return this.updateVenueSettings(venueId, currentSettings);
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

  async validateSettings(settings: IVenueSettings): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (settings.general?.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(settings.general.currency)) {
        errors.push('Invalid currency code');
      }
    }

    if (settings.branding?.primaryColor) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      if (!hexRegex.test(settings.branding.primaryColor)) {
        errors.push('Invalid primary color format');
      }
    }

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

  /**
   * Convert DB row to IVenueSettings interface
   */
  private rowToSettings(row: any): IVenueSettings {
    const defaults = this.getDefaultSettings();

    return {
      general: {
        ...defaults.general,
        currency: row.accepted_currencies?.[0] || defaults.general!.currency,
      },
      ticketing: {
        ...defaults.ticketing,
        maxTicketsPerOrder: row.max_tickets_per_order ?? defaults.ticketing!.maxTicketsPerOrder,
      },
      notifications: defaults.notifications,
      branding: defaults.branding,
      payment: {
        ...defaults.payment,
        currency: row.accepted_currencies?.[0] || defaults.payment!.currency,
        paymentMethods: row.payment_methods || defaults.payment!.paymentMethods,
      },
      features: defaults.features,
    };
  }

  /**
   * Convert IVenueSettings to DB row format
   */
  private settingsToRow(settings: Partial<IVenueSettings>): any {
    const row: any = {};

    if (settings.ticketing?.maxTicketsPerOrder !== undefined) {
      row.max_tickets_per_order = settings.ticketing.maxTicketsPerOrder;
    }

    if (settings.payment?.paymentMethods !== undefined) {
      row.payment_methods = settings.payment.paymentMethods;
    }

    if (settings.payment?.currency !== undefined) {
      row.accepted_currencies = [settings.payment.currency];
    }

    if (settings.general?.currency !== undefined) {
      row.accepted_currencies = [settings.general.currency];
    }

    return row;
  }
}
