/**
 * Privacy & GDPR Validation Schemas
 * 
 * Joi schemas for validating privacy-related requests
 */

import Joi from 'joi';
import { DataExportFormat, ConsentPurpose, DeletionStrategy } from '../types/privacy.types';

// ============================================================================
// Data Access Request Schemas
// ============================================================================

export const createDataAccessRequestSchema = Joi.object({
  format: Joi.string()
    .valid(...Object.values(DataExportFormat))
    .optional()
    .default(DataExportFormat.JSON)
    .description('Export format'),
  email: Joi.string()
    .email()
    .optional()
    .description('Email address for notification'),
});

export const downloadExportSchema = Joi.object({
  requestId: Joi.string()
    .uuid()
    .required()
    .description('Data access request ID'),
  token: Joi.string()
    .required()
    .min(32)
    .description('Download token'),
});

// ============================================================================
// Data Deletion Request Schemas
// ============================================================================

export const createDataDeletionRequestSchema = Joi.object({
  reason: Joi.string()
    .max(500)
    .optional()
    .description('Reason for deletion request'),
  strategy: Joi.string()
    .valid(...Object.values(DeletionStrategy))
    .optional()
    .default(DeletionStrategy.ANONYMIZE)
    .description('Deletion strategy'),
});

// ============================================================================
// Consent Management Schemas
// ============================================================================

export const updateConsentSchema = Joi.object({
  purpose: Joi.string()
    .valid(...Object.values(ConsentPurpose))
    .required()
    .description('Consent purpose'),
  granted: Joi.boolean()
    .required()
    .description('Whether consent is granted or denied'),
  version: Joi.number()
    .integer()
    .positive()
    .optional()
    .description('Terms of service version'),
});

export const getConsentSchema = Joi.object({
  purpose: Joi.string()
    .valid(...Object.values(ConsentPurpose))
    .required()
    .description('Consent purpose'),
});

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const privacyQuerySchema = Joi.object({
  status: Joi.string()
    .optional()
    .description('Filter by status'),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .description('Number of results to return'),
  offset: Joi.number()
    .integer()
    .min(0)
    .optional()
    .default(0)
    .description('Number of results to skip'),
});

// ============================================================================
// UUID Parameter Schema
// ============================================================================

export const uuidParamSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .description('Resource ID'),
});
