import { ValidationError } from '../ai/errors.js';

/**
 * Abstract BaseController Class (OOP Controller Layer Root)
 * Provides standardized HTTP response formatting and centralized controller error handling.
 */
export class BaseController {
  constructor() {
    if (new.target === BaseController) {
      throw new TypeError('Cannot instantiate abstract class BaseController directly');
    }
  }

  /**
   * Send standardized JSON HTTP response
   */
  sendJson(res, payload, statusCode = 200) {
    return res.status(statusCode).json(payload);
  }

  /**
   * Handle domain, validation, and runtime errors consistently
   */
  handleError(res, error, defaultMessage = 'Internal server error') {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: {
          message: error.message,
          field: error.field,
          code: 400
        }
      });
    }

    const statusCode = error.status || error.code || 500;
    return res.status(statusCode).json({
      error: {
        message: error.message || defaultMessage,
        code: statusCode
      }
    });
  }
}
