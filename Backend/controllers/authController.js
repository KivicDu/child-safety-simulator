import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User.js';

// Generate simple token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const sendOtpEmail = async (email, otp, name) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Child Safety Simulator" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Password Reset OTP Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f0f9ff; border-radius: 16px;">
        <h2 style="color: #0369a1; text-align: center; margin-bottom: 8px;">Password Reset</h2>
        <p style="color: #64748b; text-align: center; margin-bottom: 32px;">Hi ${name || 'there'}, here is your OTP code:</p>
        
        <div style="background: white; border-radius: 12px; padding: 24px; text-align: center; border: 3px solid #bae6fd; margin-bottom: 24px;">
          <div style="font-size: 48px; font-weight: 900; letter-spacing: 16px; color: #0284c7; font-family: monospace;">
            ${otp}
          </div>
        </div>
        
        <p style="color: #94a3b8; text-align: center; font-size: 14px;">
          !This code expires in <strong>5 minutes</strong>.<br/>
          If you did not request this, please ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const newUser = await User.create({
      name,
      email,
      password,
      token: generateToken()
    });

    console.log(`User registered: ${email}`);

    res.json({
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        token: newUser.token,
        createdAt: newUser.createdAt
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = generateToken();
    user.token = token;
    user.lastLogin = Date.now();
    await user.save();

    console.log(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        token: user.token,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verify = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const user = await User.findOne({ token }).select('name email token');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        token: user.token
      }
    });

  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    const user = await User.findOne({ token });
    if (user) {
      user.token = null;
      await user.save();
      console.log(`User logged out: ${user.email}`);
    }

    res.json({ success: true, message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const user = await User.findOne({ token }).select('name email token createdAt');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        token: user.token,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { name } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (name) {
      user.name = name;
      await user.save();
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        token: user.token
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Forgot password - send OTP to email
// @route   POST /api/auth/forgotpassword
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: 'There is no account with that email' });
    }

    // Generate 4-digit OTP
    const otp = user.generateOtp();
    await user.save({ validateBeforeSave: false });

    // Send OTP via email
    try {
      await sendOtpEmail(normalizedEmail, otp, user.name);
      console.log(`[AUTH] OTP sent to ${normalizedEmail}`);
    } catch (emailError) {
      user.resetOtp = null;
      user.resetOtpExpire = null;
      await user.save({ validateBeforeSave: false });
      console.error('Email send error:', emailError);
      return res.status(500).json({ success: false, error: 'Failed to send OTP email. Please check your email configuration.' });
    }

    res.json({
      success: true,
      message: 'OTP has been sent to your email',
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verifyotp
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.resetOtp || !user.resetOtpExpire) {
      return res.status(400).json({ success: false, error: 'No OTP found. Please request a new one.' });
    }

    if (user.resetOtpExpire < Date.now()) {
      user.resetOtp = null;
      user.resetOtpExpire = null;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    if (user.resetOtp !== otp.toString()) {
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please try again.' });
    }

    user.resetOtpVerified = true;
    await user.save({ validateBeforeSave: false });

    console.log(`OTP verified for: ${normalizedEmail}`);

    res.json({
      success: true,
      message: 'OTP verified successfully',
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Reset password using verified OTP
// @route   POST /api/auth/resetpassword-otp
export const resetPasswordOtp = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and new password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.resetOtpVerified) {
      return res.status(400).json({ success: false, error: 'Please verify your OTP first.' });
    }

    if (!user.resetOtpExpire || user.resetOtpExpire < Date.now()) {
      user.resetOtp = null;
      user.resetOtpExpire = null;
      user.resetOtpVerified = false;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ success: false, error: 'Session expired. Please restart the reset process.' });
    }

    user.password = password;
    user.resetOtp = null;
    user.resetOtpExpire = null;
    user.resetOtpVerified = false;
    user.token = generateToken();

    await user.save();

    console.log(`Password reset via OTP for: ${normalizedEmail}`);

    res.json({
      success: true,
      message: 'Password reset successful',
      token: user.token,
    });

  } catch (error) {
    console.error('Reset password OTP error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Legacy: Reset password via token
// @route   PUT /api/auth/resetpassword/:resettoken
export const resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired token' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.token = crypto.randomBytes(32).toString('hex');

    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful',
      token: user.token
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};