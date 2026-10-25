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
    if (typeof res.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    return res.status(statusCode).json(payload);
  }

  /**
   * Send standardized error response
   */
  sendError(res, message, statusCode = 400) {
    return res.status(statusCode).json({
      error: {
        message,
        code: statusCode
      }
    });
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

    const rawCode = error?.statusCode ?? error?.status ?? error?.code;
    const statusCode =
      typeof rawCode === 'number' && Number.isInteger(rawCode) && rawCode >= 400 && rawCode <= 599
        ? rawCode
        : 500;

    if (statusCode >= 500) {
      console.error(`[BaseController Error]:`, error);
    }

    const safeMessage =
      statusCode >= 500
        ? defaultMessage
        : (error?.message || defaultMessage);

    return res.status(statusCode).json({
      error: {
        message: safeMessage,
        code: statusCode
      }
    });
  }
}
