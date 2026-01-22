import * as Joi from 'joi';

// BUG FIX: ISO 4217 Currency Codes (common subset - extend as needed)
const ISO_4217_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
  'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'INR', 'RUB', 'BRL', 'ZAR',
  'DKK', 'PLN', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'AED',
  'COP', 'SAR', 'MYR', 'RON', 'ARS', 'VND', 'UAH', 'NGN', 'EGP', 'PKR'
];

// BUG FIX: ISO 639-1 Language Codes (common subset - extend as needed)
const ISO_639_1_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'bn', 'pa', 'te', 'mr', 'ta', 'ur', 'gu', 'kn',
  'ml', 'or', 'pl', 'uk', 'ro', 'nl', 'el', 'cs', 'sv', 'hu',
  'fi', 'no', 'da', 'tr', 'vi', 'th', 'id', 'ms', 'fa', 'he'
];

/**
 * Settings schema - validates nested IVenueSettings structure
 * Maps to flat DB columns via SettingsModel
 */
export const updateSettingsSchema = {
  body: Joi.object({
    general: Joi.object({
      timezone: Joi.string().max(50),
      currency: Joi.string().valid(...ISO_4217_CURRENCIES),
      language: Joi.string().valid(...ISO_639_1_LANGUAGES),
      dateFormat: Joi.string().max(20),
      timeFormat: Joi.string().valid('12h', '24h')
    }).unknown(false),

    ticketing: Joi.object({
      allowRefunds: Joi.boolean(),
      refundWindow: Joi.number().min(0).max(720),
      maxTicketsPerOrder: Joi.number().min(1).max(100),
      requirePhoneNumber: Joi.boolean(),
      enableWaitlist: Joi.boolean(),
      transferDeadline: Joi.number().min(0).max(168),
      ticketResaleAllowed: Joi.boolean(),
      allowPrintAtHome: Joi.boolean(),
      allowMobileTickets: Joi.boolean(),
      requireIdVerification: Joi.boolean(),
      ticketTransferAllowed: Joi.boolean()
    }).unknown(false),

    notifications: Joi.object({
      emailEnabled: Joi.boolean(),
      smsEnabled: Joi.boolean(),
      webhookUrl: Joi.string().uri().max(2000).allow(''),
      notifyOnPurchase: Joi.boolean(),
      notifyOnRefund: Joi.boolean(),
      dailyReportEnabled: Joi.boolean()
    }).unknown(false),

    branding: Joi.object({
      primaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      secondaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      logo: Joi.string().uri().max(2000).allow(''),
      emailFooter: Joi.string().max(500)
    }).unknown(false),

    payment: Joi.object({
      currency: Joi.string().valid(...ISO_4217_CURRENCIES),
      taxRate: Joi.number().min(0).max(100),
      includeTaxInPrice: Joi.boolean(),
      paymentMethods: Joi.array().items(Joi.string().max(50)),
      acceptedCurrencies: Joi.array().items(Joi.string().valid(...ISO_4217_CURRENCIES)),
      payoutFrequency: Joi.string().valid('daily', 'weekly', 'biweekly', 'monthly'),
      minimumPayoutAmount: Joi.number().min(0).max(10000)
    }).unknown(false),

    fees: Joi.object({
      serviceFeePercentage: Joi.number().min(0).max(100),
      facilityFeeAmount: Joi.number().min(0).max(1000),
      processingFeePercentage: Joi.number().min(0).max(100)
    }).unknown(false),

    resale: Joi.object({
      maxResalePriceMultiplier: Joi.number().min(1).max(10),
      maxResalePriceFixed: Joi.number().min(0),
      useFaceValueCap: Joi.boolean(),
      maxTransfersPerTicket: Joi.number().min(0).max(100),
      requireSellerVerification: Joi.boolean(),
      defaultJurisdiction: Joi.string().max(10),
      jurisdictionRules: Joi.object().unknown(true),
      resaleCutoffHours: Joi.number().min(0).max(720),
      listingCutoffHours: Joi.number().min(0).max(720),
      antiScalpingEnabled: Joi.boolean(),
      purchaseCooldownMinutes: Joi.number().min(0).max(1440),
      maxTicketsPerBuyer: Joi.number().min(1).max(1000),
      requireArtistApproval: Joi.boolean(),
      approvedResalePlatforms: Joi.array().items(Joi.string().max(100))
    }).unknown(false),

    features: Joi.object({
      nftEnabled: Joi.boolean(),
      qrCodeEnabled: Joi.boolean(),
      seasonPassEnabled: Joi.boolean(),
      groupDiscountsEnabled: Joi.boolean()
    }).unknown(false)

  }).min(1).unknown(false)
};
