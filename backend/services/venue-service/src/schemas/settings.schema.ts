import * as Joi from 'joi';

export const updateSettingsSchema = {
  body: Joi.object({
    general: Joi.object({
      timezone: Joi.string().max(50),
      currency: Joi.string().length(3),
      language: Joi.string().length(2),
      dateFormat: Joi.string().max(20),
      timeFormat: Joi.string().valid('12h', '24h')
    }),
    ticketing: Joi.object({
      allowRefunds: Joi.boolean(),
      refundWindow: Joi.number().min(0).max(720), // max 30 days in hours
      maxTicketsPerOrder: Joi.number().min(1).max(100),
      requirePhoneNumber: Joi.boolean(),
      enableWaitlist: Joi.boolean(),
      transferDeadline: Joi.number().min(0).max(168) // max 7 days in hours
    }),
    notifications: Joi.object({
      emailEnabled: Joi.boolean(),
      smsEnabled: Joi.boolean(),
      webhookUrl: Joi.string().uri().allow(''),
      notifyOnPurchase: Joi.boolean(),
      notifyOnRefund: Joi.boolean(),
      dailyReportEnabled: Joi.boolean()
    }),
    branding: Joi.object({
      primaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      secondaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      logo: Joi.string().uri().allow(''),
      emailFooter: Joi.string().max(500)
    })
  }).min(1)
};
