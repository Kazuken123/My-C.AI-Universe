import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/social', authController.socialAuth);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/verify-code', authController.verifyResetCode);
router.post('/auth/reset-password', authController.resetPassword);
router.get('/auth/me', optionalAuth, authController.me);
router.put('/auth/profile', requireAuth, authController.updateProfile);
router.post('/auth/logout', authController.logout);

export default router;
