import { BaseController } from './BaseController.js';
import { authService } from '../services/auth.service.js';

/**
 * AuthController Class (extends BaseController)
 * Handles HTTP requests for user sign-up, sign-in, profile retrieval, and session verification.
 */
export class AuthController extends BaseController {
  constructor(service = authService) {
    super();
    this.service = service;

    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.me = this.me.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.logout = this.logout.bind(this);
  }

  updateProfile(req, res) {
    try {
      const { displayName, avatar } = req.body || {};
      const result = this.service.updateProfile({
        userId: req.user.id,
        displayName,
        avatar
      });
      return this.sendJson(res, { user: result, message: 'Profile updated successfully' }, 200);
    } catch (error) {
      return this.handleError(res, error, 'Failed to update profile');
    }
  }

  register(req, res) {
    try {
      const { username, password, displayName, avatar } = req.body || {};
      const result = this.service.register({ username, password, displayName, avatar });
      return this.sendJson(res, result, 201);
    } catch (error) {
      return this.handleError(res, error, 'Registration failed');
    }
  }

  login(req, res) {
    try {
      const { username, password } = req.body || {};
      const result = this.service.login({ username, password });
      return this.sendJson(res, result, 200);
    } catch (error) {
      return this.handleError(res, error, 'Sign in failed');
    }
  }

  me(req, res) {
    try {
      if (!req.user) {
        return this.sendJson(res, { user: null, authenticated: false });
      }
      return this.sendJson(res, { user: req.user.toJSON(), authenticated: true });
    } catch (error) {
      return this.handleError(res, error, 'Failed to fetch current user profile');
    }
  }

  logout(_req, res) {
    return this.sendJson(res, { message: 'Successfully signed out', authenticated: false });
  }
}

export const authController = new AuthController();
