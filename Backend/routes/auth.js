import express from 'express';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/logout
router.post('/logout', authController.logout);

// GET /api/auth/verify
router.get('/verify', authController.verify);

// GET /api/auth/profile
router.get('/profile', authController.getProfile);

// PUT /api/auth/profile
router.put('/profile', authController.updateProfile);

export default router;
