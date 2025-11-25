import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger';

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Phone number validation regex (E.164 format)
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

// Content length limits
const MAX_SUBJECT_LENGTH = 255;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_RECIPIENTS = 100;

interface ValidationError {
  field: string;
  message: string;
}

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function validatePhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

function sanitizeString(str: string): string {
  // Remove potential XSS vectors
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .trim();
}

export async function validateSendRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body as any;
  const errors: ValidationError[] = [];

  // Validate channel
  if (!body.channel || !['email', 'sms'].includes(body.channel)) {
    errors.push({
      field: 'channel',
      message: 'Channel must be either "email" or "sms"'
    });
  }

  // Validate recipient based on channel
  if (body.channel === 'email') {
    if (!body.to || !validateEmail(body.to)) {
      errors.push({
        field: 'to',
        message: 'Valid email address is required'
      });
    }
  } else if (body.channel === 'sms') {
    if (!body.to || !validatePhone(body.to)) {
      errors.push({
        field: 'to',
        message: 'Valid phone number in E.164 format is required (e.g., +1234567890)'
      });
    }
  }

  // Validate subject (for email)
  if (body.channel === 'email') {
    if (!body.subject || typeof body.subject !== 'string') {
      errors.push({
        field: 'subject',
        message: 'Subject is required for email notifications'
      });
    } else if (body.subject.length > MAX_SUBJECT_LENGTH) {
      errors.push({
        field: 'subject',
        message: `Subject must not exceed ${MAX_SUBJECT_LENGTH} characters`
      });
    } else {
      body.subject = sanitizeString(body.subject);
    }
  }

  // Validate message
  if (!body.message || typeof body.message !== 'string') {
    errors.push({
      field: 'message',
      message: 'Message is required'
    });
  } else if (body.message.length === 0) {
    errors.push({
      field: 'message',
      message: 'Message cannot be empty'
    });
  } else if (body.message.length > MAX_MESSAGE_LENGTH) {
    errors.push({
      field: 'message',
      message: `Message must not exceed ${MAX_MESSAGE_LENGTH} characters`
    });
  } else {
    body.message = sanitizeString(body.message);
  }

  // Validate template (optional)
  if (body.template) {
    if (typeof body.template !== 'string') {
      errors.push({
        field: 'template',
        message: 'Template must be a string'
      });
    } else {
      body.template = sanitizeString(body.template);
    }
  }

  // Validate data (optional)
  if (body.data !== undefined && typeof body.data !== 'object') {
    errors.push({
      field: 'data',
      message: 'Data must be an object'
    });
  }

  if (errors.length > 0) {
    logger.warn('Validation failed for send request', { errors, body });
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      errors
    });
  }
}

export async function validateBatchSendRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body as any;
  const errors: ValidationError[] = [];

  // Validate channel
  if (!body.channel || !['email', 'sms'].includes(body.channel)) {
    errors.push({
      field: 'channel',
      message: 'Channel must be either "email" or "sms"'
    });
  }

  // Validate recipients array
  if (!body.recipients || !Array.isArray(body.recipients)) {
    errors.push({
      field: 'recipients',
      message: 'Recipients must be an array'
    });
  } else if (body.recipients.length === 0) {
    errors.push({
      field: 'recipients',
      message: 'Recipients array cannot be empty'
    });
  } else if (body.recipients.length > MAX_RECIPIENTS) {
    errors.push({
      field: 'recipients',
      message: `Recipients array must not exceed ${MAX_RECIPIENTS} items`
    });
  } else {
    // Validate each recipient
    body.recipients.forEach((recipient: any, index: number) => {
      if (!recipient.to) {
        errors.push({
          field: `recipients[${index}].to`,
          message: 'Recipient address is required'
        });
      } else if (body.channel === 'email' && !validateEmail(recipient.to)) {
        errors.push({
          field: `recipients[${index}].to`,
          message: 'Invalid email address'
        });
      } else if (body.channel === 'sms' && !validatePhone(recipient.to)) {
        errors.push({
          field: `recipients[${index}].to`,
          message: 'Invalid phone number (must be E.164 format)'
        });
      }

      // Validate subject for email
      if (body.channel === 'email' && recipient.subject) {
        if (recipient.subject.length > MAX_SUBJECT_LENGTH) {
          errors.push({
            field: `recipients[${index}].subject`,
            message: `Subject must not exceed ${MAX_SUBJECT_LENGTH} characters`
          });
        } else {
          recipient.subject = sanitizeString(recipient.subject);
        }
      }

      // Validate message
      if (recipient.message) {
        if (typeof recipient.message !== 'string') {
          errors.push({
            field: `recipients[${index}].message`,
            message: 'Message must be a string'
          });
        } else if (recipient.message.length > MAX_MESSAGE_LENGTH) {
          errors.push({
            field: `recipients[${index}].message`,
            message: `Message must not exceed ${MAX_MESSAGE_LENGTH} characters`
          });
        } else {
          recipient.message = sanitizeString(recipient.message);
        }
      }

      // Validate data
      if (recipient.data !== undefined && typeof recipient.data !== 'object') {
        errors.push({
          field: `recipients[${index}].data`,
          message: 'Data must be an object'
        });
      }
    });
  }

  // Validate template (optional)
  if (body.template) {
    if (typeof body.template !== 'string') {
      errors.push({
        field: 'template',
        message: 'Template must be a string'
      });
    } else {
      body.template = sanitizeString(body.template);
    }
  }

  // Validate default subject (optional for email)
  if (body.channel === 'email' && body.subject) {
    if (body.subject.length > MAX_SUBJECT_LENGTH) {
      errors.push({
        field: 'subject',
        message: `Subject must not exceed ${MAX_SUBJECT_LENGTH} characters`
      });
    } else {
      body.subject = sanitizeString(body.subject);
    }
  }

  // Validate default message (optional)
  if (body.message) {
    if (typeof body.message !== 'string') {
      errors.push({
        field: 'message',
        message: 'Message must be a string'
      });
    } else if (body.message.length > MAX_MESSAGE_LENGTH) {
      errors.push({
        field: 'message',
        message: `Message must not exceed ${MAX_MESSAGE_LENGTH} characters`
      });
    } else {
      body.message = sanitizeString(body.message);
    }
  }

  if (errors.length > 0) {
    logger.warn('Validation failed for batch send request', { errors });
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      errors
    });
  }
}
