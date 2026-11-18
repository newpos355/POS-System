require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function testPassword() {
  await mongoose.connect(process.env.MONGO_DB_URL);
  const User = require('./models/User');

  const emails = ['mawais01890@gmail.com', 'mawais01980@gmail.com'];
  const testPasswords = ['Mekapos@2026', 'Password123!', 'Mekapos2026', 'Mekapos@2024'];

  for (const email of emails) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      continue;
    }
    console.log(`\nTesting user: ${email} (Name: ${user.name}, Role: ${user.role})`);
    for (const p of testPasswords) {
      const match = await user.matchPassword(p);
      console.log(`  - Password "${p}": ${match ? '✅ MATCH!' : '❌ No match'}`);
    }
  }

  process.exit(0);
}

testPassword().catch(e => { console.error(e); process.exit(1); });
