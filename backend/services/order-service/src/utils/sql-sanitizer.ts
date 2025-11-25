/**
 * SQL Sanitization Utilities
 * Provides helper functions for safe dynamic SQL query construction
 */

import { logger } from './logger';

/**
 * Sanitize table name to prevent SQL injection
 * Only allows alphanumeric characters and underscores
 */
export function sanitizeTableName(tableName: string): string {
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('Invalid table name');
  }

  // Remove any quotes or special characters
  const sanitized = tableName.replace(/[^a-zA-Z0-9_]/g, '');

  if (sanitized !== tableName) {
    logger.warn('Table name was sanitized', {
      original: tableName,
      sanitized,
    });
  }

  if (sanitized.length === 0) {
    throw new Error('Table name must contain at least one valid character');
  }

  return sanitized;
}

/**
 * Sanitize column name to prevent SQL injection
 * Only allows alphanumeric characters, underscores, and dots (for qualified names)
 */
export function sanitizeColumnName(columnName: string): string {
  if (!columnName || typeof columnName !== 'string') {
    throw new Error('Invalid column name');
  }

  // Allow dots for table.column syntax
  const sanitized = columnName.replace(/[^a-zA-Z0-9_.]/g, '');

  if (sanitized !== columnName) {
    logger.warn('Column name was sanitized', {
      original: columnName,
      sanitized,
    });
  }

  if (sanitized.length === 0) {
    throw new Error('Column name must contain at least one valid character');
  }

  return sanitized;
}

/**
 * Sanitize ORDER BY clause
 * Validates direction and column name
 */
export function sanitizeOrderBy(
  column: string,
  direction: string = 'ASC'
): { column: string; direction: 'ASC' | 'DESC' } {
  const sanitizedColumn = sanitizeColumnName(column);

  const upperDirection = direction.toUpperCase();
  if (upperDirection !== 'ASC' && upperDirection !== 'DESC') {
    throw new Error('Invalid sort direction. Must be ASC or DESC');
  }

  return {
    column: sanitizedColumn,
    direction: upperDirection as 'ASC' | 'DESC',
  };
}

/**
 * Validate and sanitize LIMIT value
 */
export function sanitizeLimit(limit: any): number {
  const parsed = parseInt(limit, 10);

  if (isNaN(parsed) || parsed < 1) {
    throw new Error('Invalid LIMIT value. Must be a positive integer');
  }

  if (parsed > 10000) {
    throw new Error('LIMIT value too large. Maximum is 10000');
  }

  return parsed;
}

/**
 * Validate and sanitize OFFSET value
 */
export function sanitizeOffset(offset: any): number {
  const parsed = parseInt(offset, 10);

  if (isNaN(parsed) || parsed < 0) {
    throw new Error('Invalid OFFSET value. Must be a non-negative integer');
  }

  if (parsed > 1000000) {
    throw new Error('OFFSET value too large. Maximum is 1000000');
  }

  return parsed;
}

/**
 * Build safe WHERE clause from conditions
 * All values are parameterized to prevent SQL injection
 */
export function buildWhereClause(
  conditions: Record<string, any>
): { clause: string; params: any[] } {
  const keys = Object.keys(conditions);

  if (keys.length === 0) {
    return { clause: '', params: [] };
  }

  const params: any[] = [];
  const clauses: string[] = [];

  let paramIndex = 1;

  for (const key of keys) {
    const sanitizedKey = sanitizeColumnName(key);
    clauses.push(`${sanitizedKey} = $${paramIndex}`);
    params.push(conditions[key]);
    paramIndex++;
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params,
  };
}

/**
 * Build safe SELECT query with validation
 */
export function buildSelectQuery(options: {
  table: string;
  columns?: string[];
  where?: Record<string, any>;
  orderBy?: { column: string; direction: string };
  limit?: number;
  offset?: number;
}): { query: string; params: any[] } {
  const sanitizedTable = sanitizeTableName(options.table);

  // Sanitize columns
  let columnList = '*';
  if (options.columns && options.columns.length > 0) {
    const sanitizedColumns = options.columns.map(sanitizeColumnName);
    columnList = sanitizedColumns.join(', ');
  }

  let query = `SELECT ${columnList} FROM ${sanitizedTable}`;
  const params: any[] = [];

  // WHERE clause
  if (options.where) {
    const { clause, params: whereParams } = buildWhereClause(options.where);
    query += ` ${clause}`;
    params.push(...whereParams);
  }

  // ORDER BY
  if (options.orderBy) {
    const { column, direction } = sanitizeOrderBy(
      options.orderBy.column,
      options.orderBy.direction
    );
    query += ` ORDER BY ${column} ${direction}`;
  }

  // LIMIT
  if (options.limit !== undefined) {
    const sanitizedLimit = sanitizeLimit(options.limit);
    query += ` LIMIT ${sanitizedLimit}`;
  }

  // OFFSET
  if (options.offset !== undefined) {
    const sanitizedOffset = sanitizeOffset(options.offset);
    query += ` OFFSET ${sanitizedOffset}`;
  }

  return { query, params };
}

/**
 * Escape string for LIKE clause
 * Escapes % and _ characters
 */
export function escapeLikePattern(pattern: string): string {
  if (!pattern || typeof pattern !== 'string') {
    return '';
  }

  return pattern
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Build safe LIKE clause
 */
export function buildLikeClause(
  column: string,
  pattern: string,
  caseInsensitive: boolean = true
): { clause: string; param: string } {
  const sanitizedColumn = sanitizeColumnName(column);
  const escapedPattern = escapeLikePattern(pattern);

  const operator = caseInsensitive ? 'ILIKE' : 'LIKE';

  return {
    clause: `${sanitizedColumn} ${operator} $`,
    param: `%${escapedPattern}%`,
  };
}

/**
 * Validate identifier (table or column name)
 * Throws error if invalid
 */
export function validateIdentifier(identifier: string): void {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }

  if (identifier.length > 63) {
    throw new Error('Identifier too long. Maximum 63 characters');
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(
      'Identifier must start with letter or underscore and contain only alphanumeric characters and underscores'
    );
  }

  // Check for SQL reserved keywords
  const reservedKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TABLE', 'INDEX', 'VIEW', 'GRANT', 'REVOKE', 'UNION', 'FROM', 'WHERE',
  ];

  if (reservedKeywords.includes(identifier.toUpperCase())) {
    throw new Error(`"${identifier}" is a reserved SQL keyword`);
  }
}

export default {
  sanitizeTableName,
  sanitizeColumnName,
  sanitizeOrderBy,
  sanitizeLimit,
  sanitizeOffset,
  buildWhereClause,
  buildSelectQuery,
  escapeLikePattern,
  buildLikeClause,
  validateIdentifier,
};
