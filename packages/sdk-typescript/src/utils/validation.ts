export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate required fields
 */
export function validateRequired(value: any, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string, fieldName: string = 'email'): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(`Invalid email format`, fieldName);
  }
}

/**
 * Validate URL format
 */
export function validateUrl(url: string, fieldName: string = 'url'): void {
  try {
    new URL(url);
  } catch {
    throw new ValidationError(`Invalid URL format`, fieldName);
  }
}

/**
 * Validate string length
 */
export function validateLength(
  value: string,
  min?: number,
  max?: number,
  fieldName: string = 'value'
): void {
  if (min !== undefined && value.length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} characters`,
      fieldName
    );
  }
  if (max !== undefined && value.length > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max} characters`,
      fieldName
    );
  }
}

/**
 * Validate number range
 */
export function validateRange(
  value: number,
  min?: number,
  max?: number,
  fieldName: string = 'value'
): void {
  if (min !== undefined && value < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min}`,
      fieldName
    );
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max}`,
      fieldName
    );
  }
}

/**
 * Validate enum value
 */
export function validateEnum<T>(
  value: T,
  allowedValues: T[],
  fieldName: string = 'value'
): void {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      fieldName
    );
  }
}

/**
 * Validate array
 */
export function validateArray(
  value: any,
  minLength?: number,
  maxLength?: number,
  fieldName: string = 'array'
): void {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }
  
  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must have at least ${minLength} items`,
      fieldName
    );
  }
  
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must have at most ${maxLength} items`,
      fieldName
    );
  }
}

/**
 * Validate UUID format
 */
export function validateUuid(uuid: string, fieldName: string = 'uuid'): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ValidationError(`Invalid UUID format`, fieldName);
  }
}

/**
 * Validate date
 */
export function validateDate(date: any, fieldName: string = 'date'): void {
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new ValidationError(`Invalid date format`, fieldName);
  }
}

/**
 * Validate object has required properties
 */
export function validateObject<T extends object>(
  obj: any,
  requiredProps: (keyof T)[],
  fieldName: string = 'object'
): void {
  if (typeof obj !== 'object' || obj === null) {
    throw new ValidationError(`${fieldName} must be an object`, fieldName);
  }
  
  for (const prop of requiredProps) {
    if (!(prop in obj)) {
      throw new ValidationError(
        `${fieldName}.${String(prop)} is required`,
        `${fieldName}.${String(prop)}`
      );
    }
  }
}
