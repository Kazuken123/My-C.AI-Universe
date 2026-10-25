import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.js';
import { uploadRateLimiter, authRateLimiter } from '../middlewares/security.js';

const router = express.Router();

router.post('/auth/register', authRateLimiter.middleware(), authController.register);
router.post('/auth/login', authRateLimiter.middleware(), authController.login);
router.post('/auth/social', authRateLimiter.middleware(), authController.socialAuth);
router.post('/auth/forgot-password', authRateLimiter.middleware(), authController.forgotPassword);
router.post('/auth/verify-code', authRateLimiter.middleware(), authController.verifyResetCode);
router.post('/auth/reset-password', authRateLimiter.middleware(), authController.resetPassword);
router.get('/auth/me', optionalAuth, authController.me);
router.put('/auth/profile', requireAuth, authController.updateProfile);
router.post('/auth/upload-avatar', requireAuth, uploadRateLimiter.middleware(), authController.uploadAvatar);
router.post('/upload/avatar', requireAuth, uploadRateLimiter.middleware(), authController.uploadAvatar);
router.post('/auth/logout', authController.logout);

export default router;
