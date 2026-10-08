import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', optionalAuth, authController.me);
router.put('/auth/profile', requireAuth, authController.updateProfile);
router.post('/auth/logout', authController.logout);

export default router;
