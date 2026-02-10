import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Ensure data directory exists
await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });

// Load or create users store
let users = [];
try {
  const data = await fs.readFile(USERS_FILE, 'utf8');
  users = JSON.parse(data);
} catch (err) {
  users = [];
}

const saveUsers = async () => {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
};

// Hash password
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// Generate simple token
const generateToken = (userId) => {
  return crypto.randomBytes(32).toString('hex');
};

export const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existing = users.find(u => u.email === email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password: hashPassword(password),
      createdAt: new Date().toISOString(),
      token: generateToken(Date.now().toString())
    };

    users.push(newUser);
    await saveUsers();

    console.log(`✅ User registered: ${email}`);

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ 
      success: true, 
      message: 'Registration successful',
      user: userWithoutPassword 
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

    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Check password
    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Generate new token
    const token = generateToken(user.id);
    user.token = token;
    user.lastLogin = new Date().toISOString();
    await saveUsers();

    console.log(`✅ User logged in: ${email}`);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      success: true, 
      message: 'Login successful',
      user: userWithoutPassword 
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

    // Find user with token
    const user = users.find(u => u.token === token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    console.log(`✅ Token verified for: ${user.email}`);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      success: true, 
      user: userWithoutPassword 
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

    // Find and clear token
    const user = users.find(u => u.token === token);
    if (user) {
      user.token = null;
      await saveUsers();
      console.log(`✅ User logged out: ${user.email}`);
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

    const user = users.find(u => u.token === token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });

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

    const user = users.find(u => u.token === token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (name) {
      user.name = name;
      user.updatedAt = new Date().toISOString();
      await saveUsers();
      console.log(`✅ Profile updated: ${user.email}`);
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
