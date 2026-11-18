require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function testPassword() {
  await mongoose.connect(process.env.MONGO_DB_URL);
  const User = require('./models/User');

  const user = await User.findOne({ email: 'mawais01980@gmail.com' }).select('+password');
  console.log('User found:', user?.email);
  console.log('Testing "Awais123@":', await user.matchPassword('Awais123@'));
  console.log('Testing "Mekapos@2026":', await user.matchPassword('Mekapos@2026'));

  process.exit(0);
}

testPassword().catch(e => { console.error(e); process.exit(1); });
