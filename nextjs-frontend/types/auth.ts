export type UserRole = 'user' | 'admin';

/**
 * User account representation
 */
export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  authProvider?: string;
  providerId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Authentication response from /register, /login, /social
 */
export interface AuthResponse {
  user: User;
  token: string;
  isNewUser?: boolean;
}

/**
 * Hydration response from GET /api/auth/me
 */
export interface AuthMeResponse {
  user: User | null;
  authenticated: boolean;
}

/**
 * Login payload
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Registration payload
 */
export interface RegisterPayload {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  avatar?: string;
}

/**
 * Social login payload
 */
export interface SocialAuthPayload {
  provider: 'google' | 'facebook';
  email?: string;
  name?: string;
  providerId?: string;
  avatar?: string;
  token?: string;
}

/**
 * Forgot password OTP request payload
 */
export interface ForgotPasswordPayload {
  email: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  email: string;
  previewCode?: string;
}

/**
 * Verify 6-digit OTP code payload
 */
export interface VerifyResetCodePayload {
  email: string;
  code: string;
}

export interface VerifyResetCodeResponse {
  valid: boolean;
}

/**
 * Reset password with OTP code payload
 */
export interface ResetPasswordPayload {
  email: string;
  code: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

/**
 * Profile update payload
 */
export interface UpdateProfilePayload {
  displayName?: string;
  username?: string;
  avatar?: string;
}

/**
 * Avatar image upload response
 */
export interface UploadAvatarResponse {
  url: string;
  filename: string;
  size: number;
}

/**
 * Logout response
 */
export interface LogoutResponse {
  message: string;
  authenticated: boolean;
}

/**
 * Default preset avatars for profile selection
 */
export const PRESET_AVATARS = ['👤', '🚀', '🌟', '🛡️', '⚔️', '🎭', '🧙', '🐺'] as const;

