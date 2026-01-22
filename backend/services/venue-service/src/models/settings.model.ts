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
    ticketResaleAllowed?: boolean;
    allowPrintAtHome?: boolean;
    allowMobileTickets?: boolean;
    requireIdVerification?: boolean;
    ticketTransferAllowed?: boolean;
  };
  notifications?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    webhookUrl?: string;
    notifyOnPurchase?: boolean;
    notifyOnRefund?: boolean;
    dailyReportEnabled?: boolean;
  };
  payment?: {
    currency?: string;
    taxRate?: number;
    includeTaxInPrice?: boolean;
    paymentMethods?: string[];
    acceptedCurrencies?: string[];
    payoutFrequency?: string;
    minimumPayoutAmount?: number;
  };
  fees?: {
    serviceFeePercentage?: number;
    facilityFeeAmount?: number;
    processingFeePercentage?: number;
  };
  resale?: {
    maxResalePriceMultiplier?: number;
    maxResalePriceFixed?: number;
    useFaceValueCap?: boolean;
    maxTransfersPerTicket?: number;
    requireSellerVerification?: boolean;
    defaultJurisdiction?: string;
    jurisdictionRules?: Record<string, any>;
    resaleCutoffHours?: number;
    listingCutoffHours?: number;
    antiScalpingEnabled?: boolean;
    purchaseCooldownMinutes?: number;
    maxTicketsPerBuyer?: number;
    requireArtistApproval?: boolean;
    approvedResalePlatforms?: string[];
  };
  features?: {
    nftEnabled?: boolean;
    qrCodeEnabled?: boolean;
    seasonPassEnabled?: boolean;
    groupDiscountsEnabled?: boolean;
  };
}

/**
 * SettingsModel - uses venue_settings table
 * Handles transformation between nested IVenueSettings and flat DB columns
 * 
 * NOTE: branding is stored in venue_branding table, not venue_settings.
 * Use the branding endpoint for branding settings.
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
    return this.db.transaction(async (trx) => {
      const existing = await trx('venue_settings')
        .where({ venue_id: venueId })
        .first();

      const rowData = this.settingsToRow(settings);

      if (existing) {
        await trx('venue_settings')
          .where({ venue_id: venueId })
          .update({
            ...rowData,
            updated_at: new Date()
          });
      } else {
        await trx('venue_settings')
          .insert({
            venue_id: venueId,
            ...rowData
          });
      }

      const row = await trx('venue_settings')
        .where({ venue_id: venueId })
        .first();

      if (!row) {
        return this.getDefaultSettings();
      }

      return this.rowToSettings(row);
    });
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
        ticketResaleAllowed: true,
        allowPrintAtHome: true,
        allowMobileTickets: true,
        requireIdVerification: false,
        ticketTransferAllowed: true,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookUrl: undefined,
        notifyOnPurchase: true,
        notifyOnRefund: true,
        dailyReportEnabled: false,
      },
      payment: {
        currency: 'USD',
        taxRate: 0,
        includeTaxInPrice: false,
        paymentMethods: ['card'],
        acceptedCurrencies: ['USD'],
        payoutFrequency: 'weekly',
        minimumPayoutAmount: 100,
      },
      fees: {
        serviceFeePercentage: 10,
        facilityFeeAmount: 5,
        processingFeePercentage: 2.9,
      },
      resale: {
        maxResalePriceMultiplier: undefined,
        maxResalePriceFixed: undefined,
        useFaceValueCap: false,
        maxTransfersPerTicket: undefined,
        requireSellerVerification: false,
        defaultJurisdiction: undefined,
        jurisdictionRules: undefined,
        resaleCutoffHours: undefined,
        listingCutoffHours: undefined,
        antiScalpingEnabled: false,
        purchaseCooldownMinutes: undefined,
        maxTicketsPerBuyer: undefined,
        requireArtistApproval: false,
        approvedResalePlatforms: undefined,
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

    // Currency validation
    if (settings.general?.currency) {
      const validCurrencies = (process.env.SUPPORTED_CURRENCIES || 'USD,EUR,GBP,CAD,AUD').split(',');
      if (!validCurrencies.includes(settings.general.currency)) {
        errors.push('Invalid currency code');
      }
    }

    // Webhook URL validation
    if (settings.notifications?.webhookUrl) {
      try {
        new URL(settings.notifications.webhookUrl);
      } catch {
        errors.push('Invalid webhook URL');
      }
    }

    // Numeric range validations
    if (settings.ticketing?.maxTicketsPerOrder !== undefined) {
      if (settings.ticketing.maxTicketsPerOrder < 1 || settings.ticketing.maxTicketsPerOrder > 100) {
        errors.push('maxTicketsPerOrder must be between 1 and 100');
      }
    }

    if (settings.fees?.serviceFeePercentage !== undefined) {
      if (settings.fees.serviceFeePercentage < 0 || settings.fees.serviceFeePercentage > 100) {
        errors.push('serviceFeePercentage must be between 0 and 100');
      }
    }

    if (settings.ticketing?.refundWindow !== undefined) {
      if (settings.ticketing.refundWindow < 0 || settings.ticketing.refundWindow > 720) {
        errors.push('refundWindow must be between 0 and 720 hours');
      }
    }

    if (settings.ticketing?.transferDeadline !== undefined) {
      if (settings.ticketing.transferDeadline < 0 || settings.ticketing.transferDeadline > 168) {
        errors.push('transferDeadline must be between 0 and 168 hours');
      }
    }

    // Time format validation
    if (settings.general?.timeFormat !== undefined) {
      if (!['12h', '24h'].includes(settings.general.timeFormat)) {
        errors.push('timeFormat must be either 12h or 24h');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert DB row to IVenueSettings interface (flat -> nested)
   */
  private rowToSettings(row: any): IVenueSettings {
    const defaults = this.getDefaultSettings();

    return {
      general: {
        timezone: row.timezone ?? defaults.general!.timezone,
        currency: row.accepted_currencies?.[0] || defaults.general!.currency,
        language: row.language ?? defaults.general!.language,
        dateFormat: row.date_format ?? defaults.general!.dateFormat,
        timeFormat: row.time_format ?? defaults.general!.timeFormat,
      },
      ticketing: {
        allowRefunds: row.allow_refunds ?? defaults.ticketing!.allowRefunds,
        refundWindow: row.refund_window ?? defaults.ticketing!.refundWindow,
        maxTicketsPerOrder: row.max_tickets_per_order ?? defaults.ticketing!.maxTicketsPerOrder,
        requirePhoneNumber: row.require_phone_number ?? defaults.ticketing!.requirePhoneNumber,
        enableWaitlist: row.enable_waitlist ?? defaults.ticketing!.enableWaitlist,
        transferDeadline: row.transfer_deadline ?? defaults.ticketing!.transferDeadline,
        ticketResaleAllowed: row.ticket_resale_allowed ?? defaults.ticketing!.ticketResaleAllowed,
        allowPrintAtHome: row.allow_print_at_home ?? defaults.ticketing!.allowPrintAtHome,
        allowMobileTickets: row.allow_mobile_tickets ?? defaults.ticketing!.allowMobileTickets,
        requireIdVerification: row.require_id_verification ?? defaults.ticketing!.requireIdVerification,
        ticketTransferAllowed: row.ticket_transfer_allowed ?? defaults.ticketing!.ticketTransferAllowed,
      },
      notifications: {
        emailEnabled: row.email_enabled ?? defaults.notifications!.emailEnabled,
        smsEnabled: row.sms_enabled ?? defaults.notifications!.smsEnabled,
        webhookUrl: row.webhook_url ?? defaults.notifications!.webhookUrl,
        notifyOnPurchase: row.notify_on_purchase ?? defaults.notifications!.notifyOnPurchase,
        notifyOnRefund: row.notify_on_refund ?? defaults.notifications!.notifyOnRefund,
        dailyReportEnabled: row.daily_report_enabled ?? defaults.notifications!.dailyReportEnabled,
      },
      payment: {
        currency: row.accepted_currencies?.[0] || defaults.payment!.currency,
        taxRate: defaults.payment!.taxRate,
        includeTaxInPrice: defaults.payment!.includeTaxInPrice,
        paymentMethods: row.payment_methods || defaults.payment!.paymentMethods,
        acceptedCurrencies: row.accepted_currencies || defaults.payment!.acceptedCurrencies,
        payoutFrequency: row.payout_frequency || defaults.payment!.payoutFrequency,
        minimumPayoutAmount: row.minimum_payout_amount != null
          ? parseFloat(row.minimum_payout_amount)
          : defaults.payment!.minimumPayoutAmount,
      },
      fees: {
        serviceFeePercentage: row.service_fee_percentage != null
          ? parseFloat(row.service_fee_percentage)
          : defaults.fees!.serviceFeePercentage,
        facilityFeeAmount: row.facility_fee_amount != null
          ? parseFloat(row.facility_fee_amount)
          : defaults.fees!.facilityFeeAmount,
        processingFeePercentage: row.processing_fee_percentage != null
          ? parseFloat(row.processing_fee_percentage)
          : defaults.fees!.processingFeePercentage,
      },
      resale: {
        maxResalePriceMultiplier: row.max_resale_price_multiplier != null
          ? parseFloat(row.max_resale_price_multiplier)
          : defaults.resale!.maxResalePriceMultiplier,
        maxResalePriceFixed: row.max_resale_price_fixed != null
          ? parseFloat(row.max_resale_price_fixed)
          : defaults.resale!.maxResalePriceFixed,
        useFaceValueCap: row.use_face_value_cap ?? defaults.resale!.useFaceValueCap,
        maxTransfersPerTicket: row.max_transfers_per_ticket ?? defaults.resale!.maxTransfersPerTicket,
        requireSellerVerification: row.require_seller_verification ?? defaults.resale!.requireSellerVerification,
        defaultJurisdiction: row.default_jurisdiction ?? defaults.resale!.defaultJurisdiction,
        jurisdictionRules: row.jurisdiction_rules ?? defaults.resale!.jurisdictionRules,
        resaleCutoffHours: row.resale_cutoff_hours ?? defaults.resale!.resaleCutoffHours,
        listingCutoffHours: row.listing_cutoff_hours ?? defaults.resale!.listingCutoffHours,
        antiScalpingEnabled: row.anti_scalping_enabled ?? defaults.resale!.antiScalpingEnabled,
        purchaseCooldownMinutes: row.purchase_cooldown_minutes ?? defaults.resale!.purchaseCooldownMinutes,
        maxTicketsPerBuyer: row.max_tickets_per_buyer ?? defaults.resale!.maxTicketsPerBuyer,
        requireArtistApproval: row.require_artist_approval ?? defaults.resale!.requireArtistApproval,
        approvedResalePlatforms: row.approved_resale_platforms ?? defaults.resale!.approvedResalePlatforms,
      },
      features: defaults.features,
    };
  }

  /**
   * Convert IVenueSettings to DB row format (nested -> flat)
   */
  private settingsToRow(settings: Partial<IVenueSettings>): Record<string, any> {
    const row: Record<string, any> = {};

    // General settings
    if (settings.general) {
      if (settings.general.timezone !== undefined) {
        row.timezone = settings.general.timezone;
      }
      if (settings.general.language !== undefined) {
        row.language = settings.general.language;
      }
      if (settings.general.dateFormat !== undefined) {
        row.date_format = settings.general.dateFormat;
      }
      if (settings.general.timeFormat !== undefined) {
        row.time_format = settings.general.timeFormat;
      }
      if (settings.general.currency !== undefined) {
        row.accepted_currencies = [settings.general.currency];
      }
    }

    // Ticketing settings
    if (settings.ticketing) {
      if (settings.ticketing.allowRefunds !== undefined) {
        row.allow_refunds = settings.ticketing.allowRefunds;
      }
      if (settings.ticketing.refundWindow !== undefined) {
        row.refund_window = settings.ticketing.refundWindow;
      }
      if (settings.ticketing.maxTicketsPerOrder !== undefined) {
        row.max_tickets_per_order = settings.ticketing.maxTicketsPerOrder;
      }
      if (settings.ticketing.requirePhoneNumber !== undefined) {
        row.require_phone_number = settings.ticketing.requirePhoneNumber;
      }
      if (settings.ticketing.enableWaitlist !== undefined) {
        row.enable_waitlist = settings.ticketing.enableWaitlist;
      }
      if (settings.ticketing.transferDeadline !== undefined) {
        row.transfer_deadline = settings.ticketing.transferDeadline;
      }
      if (settings.ticketing.ticketResaleAllowed !== undefined) {
        row.ticket_resale_allowed = settings.ticketing.ticketResaleAllowed;
      }
      if (settings.ticketing.allowPrintAtHome !== undefined) {
        row.allow_print_at_home = settings.ticketing.allowPrintAtHome;
      }
      if (settings.ticketing.allowMobileTickets !== undefined) {
        row.allow_mobile_tickets = settings.ticketing.allowMobileTickets;
      }
      if (settings.ticketing.requireIdVerification !== undefined) {
        row.require_id_verification = settings.ticketing.requireIdVerification;
      }
      if (settings.ticketing.ticketTransferAllowed !== undefined) {
        row.ticket_transfer_allowed = settings.ticketing.ticketTransferAllowed;
      }
    }

    // Notification settings
    if (settings.notifications) {
      if (settings.notifications.emailEnabled !== undefined) {
        row.email_enabled = settings.notifications.emailEnabled;
      }
      if (settings.notifications.smsEnabled !== undefined) {
        row.sms_enabled = settings.notifications.smsEnabled;
      }
      if (settings.notifications.webhookUrl !== undefined) {
        row.webhook_url = settings.notifications.webhookUrl;
      }
      if (settings.notifications.notifyOnPurchase !== undefined) {
        row.notify_on_purchase = settings.notifications.notifyOnPurchase;
      }
      if (settings.notifications.notifyOnRefund !== undefined) {
        row.notify_on_refund = settings.notifications.notifyOnRefund;
      }
      if (settings.notifications.dailyReportEnabled !== undefined) {
        row.daily_report_enabled = settings.notifications.dailyReportEnabled;
      }
    }

    // Fee settings
    if (settings.fees) {
      if (settings.fees.serviceFeePercentage !== undefined) {
        row.service_fee_percentage = settings.fees.serviceFeePercentage;
      }
      if (settings.fees.facilityFeeAmount !== undefined) {
        row.facility_fee_amount = settings.fees.facilityFeeAmount;
      }
      if (settings.fees.processingFeePercentage !== undefined) {
        row.processing_fee_percentage = settings.fees.processingFeePercentage;
      }
    }

    // Payment settings
    if (settings.payment) {
      if (settings.payment.paymentMethods !== undefined) {
        row.payment_methods = settings.payment.paymentMethods;
      }
      if (settings.payment.acceptedCurrencies !== undefined) {
        row.accepted_currencies = settings.payment.acceptedCurrencies;
      }
      if (settings.payment.payoutFrequency !== undefined) {
        row.payout_frequency = settings.payment.payoutFrequency;
      }
      if (settings.payment.minimumPayoutAmount !== undefined) {
        row.minimum_payout_amount = settings.payment.minimumPayoutAmount;
      }
      if (settings.payment.currency !== undefined) {
        row.accepted_currencies = [settings.payment.currency];
      }
    }

    // Resale settings
    if (settings.resale) {
      if (settings.resale.maxResalePriceMultiplier !== undefined) {
        row.max_resale_price_multiplier = settings.resale.maxResalePriceMultiplier;
      }
      if (settings.resale.maxResalePriceFixed !== undefined) {
        row.max_resale_price_fixed = settings.resale.maxResalePriceFixed;
      }
      if (settings.resale.useFaceValueCap !== undefined) {
        row.use_face_value_cap = settings.resale.useFaceValueCap;
      }
      if (settings.resale.maxTransfersPerTicket !== undefined) {
        row.max_transfers_per_ticket = settings.resale.maxTransfersPerTicket;
      }
      if (settings.resale.requireSellerVerification !== undefined) {
        row.require_seller_verification = settings.resale.requireSellerVerification;
      }
      if (settings.resale.defaultJurisdiction !== undefined) {
        row.default_jurisdiction = settings.resale.defaultJurisdiction;
      }
      if (settings.resale.jurisdictionRules !== undefined) {
        row.jurisdiction_rules = settings.resale.jurisdictionRules;
      }
      if (settings.resale.resaleCutoffHours !== undefined) {
        row.resale_cutoff_hours = settings.resale.resaleCutoffHours;
      }
      if (settings.resale.listingCutoffHours !== undefined) {
        row.listing_cutoff_hours = settings.resale.listingCutoffHours;
      }
      if (settings.resale.antiScalpingEnabled !== undefined) {
        row.anti_scalping_enabled = settings.resale.antiScalpingEnabled;
      }
      if (settings.resale.purchaseCooldownMinutes !== undefined) {
        row.purchase_cooldown_minutes = settings.resale.purchaseCooldownMinutes;
      }
      if (settings.resale.maxTicketsPerBuyer !== undefined) {
        row.max_tickets_per_buyer = settings.resale.maxTicketsPerBuyer;
      }
      if (settings.resale.requireArtistApproval !== undefined) {
        row.require_artist_approval = settings.resale.requireArtistApproval;
      }
      if (settings.resale.approvedResalePlatforms !== undefined) {
        row.approved_resale_platforms = settings.resale.approvedResalePlatforms;
      }
    }

    return row;
  }
}
