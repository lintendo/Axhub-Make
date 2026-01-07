/**
 * Validation service for data management
 * Handles validation of data records, IDs, and data types
 */

import { DataRecord } from './lowdbService';

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate that a value is not empty
 */
export function validateRequired(value: any, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`Missing required field: ${fieldName}`, fieldName);
  }
}

/**
 * Validate file name format
 * File names can contain letters, numbers, underscores, hyphens, and Chinese characters
 */
export function validateFileName(fileName: string): void {
  if (!fileName || typeof fileName !== 'string') {
    throw new ValidationError('Invalid fileName parameter', 'fileName');
  }
  
  // Trim whitespace
  const trimmed = fileName.trim();
  if (trimmed === '') {
    throw new ValidationError('fileName cannot be empty', 'fileName');
  }
  
  // Check for invalid characters in file name (allow Chinese characters)
  // Disallow: / \ : * ? " < > |
  if (/[/\\:*?"<>|]/.test(trimmed)) {
    throw new ValidationError(
      'fileName cannot contain the following characters: / \\ : * ? " < > |',
      'fileName'
    );
  }
}

/**
 * Validate that ID field exists and is a valid string
 * Requirement 3.2: Validate the required id field before persisting
 */
export function validateIdField(id: any): void {
  if (id === undefined || id === null) {
    throw new ValidationError('Missing required field: id', 'id');
  }
  
  if (typeof id !== 'string') {
    throw new ValidationError('Invalid id: must be a string', 'id');
  }
  
  if (id.trim() === '') {
    throw new ValidationError('Invalid id: cannot be empty', 'id');
  }
}

/**
 * Validate data types for record fields
 * Requirement 3.4: Validate data types for all fields
 */
export function validateDataTypes(data: any): void {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid data: must be an object');
  }
  
  // Check if data is an array (not allowed for single record)
  if (Array.isArray(data)) {
    throw new ValidationError('Invalid data: expected object, got array');
  }
  
  // Validate that all values are of acceptable types
  for (const [key, value] of Object.entries(data)) {
    // Skip id field as it's validated separately
    if (key === 'id') continue;
    
    // Check for undefined values (null is allowed)
    if (value === undefined) {
      throw new ValidationError(
        `Invalid data type for field '${key}': undefined is not allowed`,
        key
      );
    }
    
    // Check for functions (not allowed in JSON)
    if (typeof value === 'function') {
      throw new ValidationError(
        `Invalid data type for field '${key}': functions are not allowed`,
        key
      );
    }
    
    // Check for symbols (not allowed in JSON)
    if (typeof value === 'symbol') {
      throw new ValidationError(
        `Invalid data type for field '${key}': symbols are not allowed`,
        key
      );
    }
    
    // Nested objects are allowed, but check for circular references
    if (typeof value === 'object' && value !== null) {
      try {
        JSON.stringify(value);
      } catch (e) {
        throw new ValidationError(
          `Invalid data type for field '${key}': circular reference or non-serializable value`,
          key
        );
      }
    }
  }
}

/**
 * Check for duplicate ID in existing records
 * Requirement 3.3: Detect duplicate IDs
 */
export function checkDuplicateId(id: string, existingRecords: DataRecord[], excludeId?: string): void {
  const duplicate = existingRecords.find(record => {
    // If excludeId is provided (for updates), skip that record
    if (excludeId && record.id === excludeId) {
      return false;
    }
    return record.id === id;
  });
  
  if (duplicate) {
    throw new ValidationError(
      `Duplicate id: a record with id '${id}' already exists`,
      'id',
      { duplicateId: id }
    );
  }
}

/**
 * Validate a complete record for insertion
 * Combines all validation checks
 */
export function validateRecordForInsert(data: any): void {
  // Validate data structure
  validateDataTypes(data);
  
  // If id is provided, validate it
  if (data.id !== undefined) {
    validateIdField(data.id);
  }
}

/**
 * Validate a record for update
 * Similar to insert but allows partial data
 */
export function validateRecordForUpdate(data: any): void {
  // Validate data structure
  validateDataTypes(data);
  
  // If id is provided in update data, validate it
  if (data.id !== undefined) {
    validateIdField(data.id);
  }
}

/**
 * Validate CSV import data
 * Checks each row for valid structure
 */
export function validateCSVData(csvData: any[]): void {
  if (!Array.isArray(csvData)) {
    throw new ValidationError('Invalid CSV data: must be an array');
  }
  
  if (csvData.length === 0) {
    throw new ValidationError('Invalid CSV data: cannot be empty');
  }
  
  // Validate each row
  csvData.forEach((row, index) => {
    try {
      validateDataTypes(row);
      
      // If row has id, validate it
      if (row.id !== undefined && row.id !== null && row.id !== '') {
        validateIdField(row.id);
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        throw new ValidationError(
          `Invalid data in CSV row ${index + 1}: ${e.message}`,
          e.field,
          { row: index + 1, ...e.details }
        );
      }
      throw e;
    }
  });
}
