/**
 * Schema validation utilities for MongoDB
 */

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  objectId: /^[0-9a-fA-F]{24}$/,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  phoneNumber: /^\+?[\d\s\-()]+$/,
  zipCode: /^\d{5}(-\d{4})?$/,
};

/**
 * Email validator
 */
export function validateEmail(email: string): boolean {
  return ValidationPatterns.email.test(email);
}

/**
 * URL validator
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return ValidationPatterns.url.test(url);
  } catch {
    return false;
  }
}

/**
 * ObjectId validator
 */
export function validateObjectId(id: string): boolean {
  return ValidationPatterns.objectId.test(id);
}

/**
 * UUID validator
 */
export function validateUuid(uuid: string): boolean {
  return ValidationPatterns.uuid.test(uuid);
}

/**
 * Validate date range
 */
export function validateDateRange(
  startDate: Date,
  endDate: Date,
  options: { allowEqual?: boolean; maxDays?: number } = {}
): { valid: boolean; error?: string } {
  const { allowEqual = false, maxDays } = options;

  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    return { valid: false, error: 'Invalid date format' };
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { valid: false, error: 'Invalid date values' };
  }

  if (startDate > endDate) {
    return { valid: false, error: 'Start date must be before end date' };
  }

  if (!allowEqual && startDate.getTime() === endDate.getTime()) {
    return { valid: false, error: 'Start date and end date cannot be equal' };
  }

  if (maxDays) {
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > maxDays) {
      return { valid: false, error: `Date range cannot exceed ${maxDays} days` };
    }
  }

  return { valid: true };
}

/**
 * Enum validator
 */
export function validateEnum<T>(value: T, allowedValues: T[]): boolean {
  return allowedValues.includes(value);
}

/**
 * Number range validator
 */
export function validateNumberRange(
  value: number,
  min?: number,
  max?: number
): { valid: boolean; error?: string } {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: 'Invalid number' };
  }

  if (min !== undefined && value < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }

  if (max !== undefined && value > max) {
    return { valid: false, error: `Value must be at most ${max}` };
  }

  return { valid: true };
}

/**
 * String length validator
 */
export function validateStringLength(
  value: string,
  min?: number,
  max?: number
): { valid: boolean; error?: string } {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Value must be a string' };
  }

  const length = value.length;

  if (min !== undefined && length < min) {
    return { valid: false, error: `String must be at least ${min} characters` };
  }

  if (max !== undefined && length > max) {
    return { valid: false, error: `String must be at most ${max} characters` };
  }

  return { valid: true };
}

/**
 * Array length validator
 */
export function validateArrayLength(
  value: any[],
  min?: number,
  max?: number
): { valid: boolean; error?: string } {
  if (!Array.isArray(value)) {
    return { valid: false, error: 'Value must be an array' };
  }

  const length = value.length;

  if (min !== undefined && length < min) {
    return { valid: false, error: `Array must have at least ${min} items` };
  }

  if (max !== undefined && length > max) {
    return { valid: false, error: `Array must have at most ${max} items` };
  }

  return { valid: true };
}

/**
 * Required field validator
 */
export function validateRequired(value: any, fieldName: string): { valid: boolean; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${fieldName} is required` };
  }

  return { valid: true };
}

/**
 * Conditional required validator
 */
export function validateConditionalRequired(
  value: any,
  fieldName: string,
  condition: boolean
): { valid: boolean; error?: string } {
  if (!condition) {
    return { valid: true };
  }

  return validateRequired(value, fieldName);
}

/**
 * Custom validator function type
 */
export type CustomValidator<T = any> = (value: T) => { valid: boolean; error?: string };

/**
 * Validate object with multiple validators
 */
export function validateObject<T extends Record<string, any>>(
  obj: T,
  validators: Partial<Record<keyof T, CustomValidator[]>>
): { valid: boolean; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};

  for (const [field, fieldValidators] of Object.entries(validators)) {
    const value = obj[field as keyof T];
    const fieldErrors: string[] = [];

    for (const validator of fieldValidators as CustomValidator[]) {
      const result = validator(value);
      if (!result.valid && result.error) {
        fieldErrors.push(result.error);
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Build MongoDB JSON Schema validator
 */
export function buildMongoJsonSchema(definition: Record<string, any>): Record<string, any> {
  return {
    bsonType: 'object',
    required: definition.required || [],
    properties: definition.properties || {},
    additionalProperties: definition.additionalProperties !== undefined ? definition.additionalProperties : true,
  };
}

/**
 * Common schema property builders
 */
export const SchemaProperties = {
  /**
   * String property with optional validation
   */
  string: (options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
  } = {}) => {
    const schema: any = { bsonType: 'string' };

    if (options.minLength !== undefined) {
      schema.minLength = options.minLength;
    }

    if (options.maxLength !== undefined) {
      schema.maxLength = options.maxLength;
    }

    if (options.pattern) {
      schema.pattern = options.pattern;
    }

    if (options.enum) {
      schema.enum = options.enum;
    }

    return schema;
  },

  /**
   * Number property with optional validation
   */
  number: (options: {
    required?: boolean;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: boolean;
    exclusiveMaximum?: boolean;
  } = {}) => {
    const schema: any = { bsonType: ['double', 'int', 'long'] };

    if (options.minimum !== undefined) {
      schema.minimum = options.minimum;
      if (options.exclusiveMinimum) {
        schema.exclusiveMinimum = true;
      }
    }

    if (options.maximum !== undefined) {
      schema.maximum = options.maximum;
      if (options.exclusiveMaximum) {
        schema.exclusiveMaximum = true;
      }
    }

    return schema;
  },

  /**
   * Boolean property
   */
  boolean: () => ({
    bsonType: 'bool',
  }),

  /**
   * Date property
   */
  date: () => ({
    bsonType: 'date',
  }),

  /**
   * ObjectId property
   */
  objectId: () => ({
    bsonType: 'objectId',
  }),

  /**
   * Array property
   */
  array: (itemSchema: any, options: { minItems?: number; maxItems?: number; uniqueItems?: boolean } = {}) => {
    const schema: any = {
      bsonType: 'array',
      items: itemSchema,
    };

    if (options.minItems !== undefined) {
      schema.minItems = options.minItems;
    }

    if (options.maxItems !== undefined) {
      schema.maxItems = options.maxItems;
    }

    if (options.uniqueItems) {
      schema.uniqueItems = true;
    }

    return schema;
  },

  /**
   * Object property
   */
  object: (properties: Record<string, any>, required: string[] = []) => ({
    bsonType: 'object',
    required,
    properties,
  }),

  /**
   * Email property
   */
  email: () => ({
    bsonType: 'string',
    pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  }),

  /**
   * URL property
   */
  url: () => ({
    bsonType: 'string',
    pattern: '^https?://.+',
  }),

  /**
   * Enum property
   */
  enum: (values: any[]) => ({
    bsonType: 'string',
    enum: values,
  }),
};

/**
 * Validate document against schema
 */
export function validateDocumentAgainstSchema(
  document: Record<string, any>,
  schema: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in document) || document[field] === null || document[field] === undefined) {
        errors.push(`Required field '${field}' is missing`);
      }
    }
  }

  // Validate properties
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      const value = document[field];

      if (value !== undefined && value !== null) {
        const fieldErrors = validateField(value, fieldSchema as Record<string, any>, field);
        errors.push(...fieldErrors);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single field against its schema
 */
function validateField(value: any, fieldSchema: Record<string, any>, fieldName: string): string[] {
  const errors: string[] = [];

  // Type validation
  if (fieldSchema.bsonType) {
    const types = Array.isArray(fieldSchema.bsonType) ? fieldSchema.bsonType : [fieldSchema.bsonType];
    // Note: Actual type checking would be more complex in real implementation
  }

  // String validations
  if (typeof value === 'string') {
    if (fieldSchema.minLength !== undefined && value.length < fieldSchema.minLength) {
      errors.push(`${fieldName} must be at least ${fieldSchema.minLength} characters`);
    }

    if (fieldSchema.maxLength !== undefined && value.length > fieldSchema.maxLength) {
      errors.push(`${fieldName} must be at most ${fieldSchema.maxLength} characters`);
    }

    if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(value)) {
      errors.push(`${fieldName} does not match required pattern`);
    }

    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      errors.push(`${fieldName} must be one of: ${fieldSchema.enum.join(', ')}`);
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
      errors.push(`${fieldName} must be at least ${fieldSchema.minimum}`);
    }

    if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
      errors.push(`${fieldName} must be at most ${fieldSchema.maximum}`);
    }
  }

  // Array validations
  if (Array.isArray(value)) {
    if (fieldSchema.minItems !== undefined && value.length < fieldSchema.minItems) {
      errors.push(`${fieldName} must have at least ${fieldSchema.minItems} items`);
    }

    if (fieldSchema.maxItems !== undefined && value.length > fieldSchema.maxItems) {
      errors.push(`${fieldName} must have at most ${fieldSchema.maxItems} items`);
    }

    if (fieldSchema.uniqueItems) {
      const uniqueValues = new Set(value.map((v) => JSON.stringify(v)));
      if (uniqueValues.size !== value.length) {
        errors.push(`${fieldName} must contain unique items`);
      }
    }
  }

  return errors;
}
