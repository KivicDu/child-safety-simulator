import express from 'express';
import * as authController from '../controllers/authController.js';
import { verifyOtp, resetPasswordOtp } from '../controllers/authController.js';

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

// POST /api/auth/forgotpassword
router.post('/forgotpassword', authController.forgotPassword);

// PUT /api/auth/resetpassword/:resettoken
router.put('/resetpassword/:resettoken', authController.resetPassword);

// POST /api/auth/verifyotp
router.post('/verifyotp', verifyOtp);

// POST /api/auth/resetpasswordotp
router.post('/resetpassword-otp', resetPasswordOtp); 

export default router;
