import express from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// All administrative routes require authenticated admin role
router.use('/admin', requireAdmin);

router.get('/admin/overview', adminController.getOverview);
router.get('/admin/users', adminController.getUsers);
router.put('/admin/users/:id/role', adminController.updateUserRole);
router.delete('/admin/users/:id', adminController.deleteUser);

router.get('/admin/characters', adminController.getCharacters);
router.delete('/admin/characters/:id', adminController.deleteCharacter);

router.get('/admin/rate-limits', adminController.getRateLimitStatus);
router.post('/admin/rate-limits/unblock', adminController.unblockClient);

export default router;
