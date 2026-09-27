/**
 * Custom error class for AI-related errors
 */
export class AIError extends Error {
  constructor(message, code = 500, originalError = null) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = code;
    this.originalError = originalError;
  }
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = 400;
    this.status = 400;
  }
}

/**
 * Custom error class for resource not found errors
 */
export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.code = 404;
    this.status = 404;
  }
}
