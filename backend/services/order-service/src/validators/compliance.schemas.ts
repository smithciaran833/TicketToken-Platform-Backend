import Joi from 'joi';

export const generateReportSchema = Joi.object({
  report_type: Joi.string().valid('SOC2', 'GDPR', 'PCI_DSS').required(),
  tenant_id: Joi.string().uuid().required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref('start_date')).required()
});
