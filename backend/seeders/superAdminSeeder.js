const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

const seedSuperAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_DB_URL || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MongoDB URI not found in .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected...');

    const adminEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@posplatform.com';
    const adminPassword = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123!';

    let admin = await User.findOne({ email: adminEmail });
    if (admin) {
      admin.role = 'superadmin';
      admin.password = adminPassword; // Pre-save hook will hash it
      await admin.save();
      console.log(`Super Admin user updated: ${adminEmail}`);
    } else {
      admin = await User.create({
        name: 'Platform Super Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'superadmin',
        isActive: true,
      });
      console.log(`Super Admin created: ${adminEmail}`);
    }

    console.log(`\nCredentials:\nEmail: ${adminEmail}\nPassword: ${adminPassword}\n`);
    process.exit(0);
  } catch (error) {
    console.error('Seeder Error:', error);
    process.exit(1);
  }
};

seedSuperAdmin();
