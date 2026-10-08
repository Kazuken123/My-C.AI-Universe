import express from 'express';
import { authController } from '../controllers/auth.controller.js';
import { optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', optionalAuth, authController.me);
router.post('/auth/logout', authController.logout);

export default router;
