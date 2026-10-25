import { BaseController } from './BaseController.js';
import { authService } from '../services/auth.service.js';
import { config } from '../config/index.js';

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
    this.socialAuth = this.socialAuth.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.verifyResetCode = this.verifyResetCode.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
    this.uploadAvatar = this.uploadAvatar.bind(this);
    this.logout = this.logout.bind(this);
  }

  async socialAuth(req, res) {
    try {
      const { provider, providerId, email, name, avatar, token } = req.body || {};
      const result = await this.service.socialAuth({
        provider,
        providerId,
        email,
        name,
        avatar,
        token
      });
      return this.sendJson(res, result, result.isNewUser ? 201 : 200);
    } catch (error) {
      return this.handleError(res, error, 'Social authentication failed');
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body || {};
      const baseUrl = config.PUBLIC_BASE_URL;
      const result = await this.service.requestPasswordReset({ email, baseUrl });
      return this.sendJson(res, result, 200);
    } catch (error) {
      return this.handleError(res, error, 'Password reset request failed');
    }
  }

  async verifyResetCode(req, res) {
    try {
      const { email, code } = req.body || {};
      const result = await this.service.verifyResetCode({ email, code });
      return this.sendJson(res, result, 200);
    } catch (error) {
      return this.handleError(res, error, 'Verification code validation failed');
    }
  }

  async resetPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body || {};
      const result = await this.service.resetPassword({ email, code, newPassword });
      return this.sendJson(res, result, 200);
    } catch (error) {
      return this.handleError(res, error, 'Password reset failed');
    }
  }

  async updateProfile(req, res) {
    try {
      const { displayName, username, avatar } = req.body || {};
      const result = await this.service.updateProfile({
        userId: req.user.id,
        displayName,
        username,
        avatar
      });
      return this.sendJson(res, { user: result, message: 'Profile updated successfully' }, 200);
    } catch (error) {
      return this.handleError(res, error, 'Failed to update profile');
    }
  }

  async register(req, res) {
    try {
      const { username, email, password, displayName, avatar } = req.body || {};
      const result = await this.service.register({ username, email, password, displayName, avatar });
      return this.sendJson(res, result, 201);
    } catch (error) {
      return this.handleError(res, error, 'Registration failed');
    }
  }

  async login(req, res) {
    try {
      const { username, password } = req.body || {};
      const result = await this.service.login({ username, password });
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

  async uploadAvatar(req, res) {
    try {
      const { image, dataUrl } = req.body || {};
      const result = await this.service.saveUploadedAvatar(image || dataUrl);
      return this.sendJson(res, result, 200);
    } catch (error) {
      return this.handleError(res, error, 'Failed to upload avatar image');
    }
  }

  logout(_req, res) {
    res.setHeader('Set-Cookie', 'cai_auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');
    return this.sendJson(res, { message: 'Successfully signed out', authenticated: false });
  }
}

export const authController = new AuthController();

export const {
  register,
  login,
  me,
  updateProfile,
  socialAuth,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  uploadAvatar,
  logout
} = authController;
