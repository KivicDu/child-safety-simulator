import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, '../data/users.json');

const migrate = async () => {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🚀 Connected to MongoDB for migration');

    // 2. Read users.json
    let legacyUsers = [];
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      legacyUsers = JSON.parse(data);
    } catch (err) {
      console.log('ℹ️ No legacy users.json found or file is empty.');
      process.exit(0);
    }

    if (legacyUsers.length === 0) {
      console.log('ℹ️ No users to migrate.');
      process.exit(0);
    }

    console.log(`📦 Found ${legacyUsers.length} users to migrate.`);

    // 3. Migrate each user
    let successCount = 0;
    let failCount = 0;

    for (const u of legacyUsers) {
      try {
        // We bypass the pre-save hook for password hashing because they are ALREADY hashed in users.json
        // We use insertMany or findOneAndUpdate to avoid double hashing if we were using .save()
        const existing = await User.findOne({ email: u.email });
        
        if (!existing) {
          // Use new User and then manually set the hashed password to avoid re-hashing
          const newUser = new User({
            name: u.name,
            email: u.email,
            password: u.password, // This is already hashed
            token: u.token,
            lastLogin: u.lastLogin ? new Date(u.lastLogin) : null,
            createdAt: u.createdAt ? new Date(u.createdAt) : new Date()
          });

          // Hack to prevent pre-save from hashing the already hashed password
          // Since our pre-save checks isModified('password'), we can try to save it directly
          // But actually, the safest way is to use User.collection.insertOne to bypass all hooks
          await User.collection.insertOne({
            name: newUser.name,
            email: newUser.email,
            password: u.password,
            token: newUser.token,
            lastLogin: newUser.lastLogin,
            createdAt: newUser.createdAt,
            updatedAt: new Date()
          });
          
          successCount++;
        } else {
          console.log(`⚠️ User ${u.email} already exists in MongoDB skipping.`);
          failCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to migrate ${u.email}:`, error.message);
        failCount++;
      }
    }

    console.log(`✅ Migration complete! Success: ${successCount}, Skipped/Failed: ${failCount}`);
    process.exit(0);

  } catch (error) {
    console.error('💥 Migration error:', error);
    process.exit(1);
  }
};

migrate();
