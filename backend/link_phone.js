require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

mongoose.connect(process.env.MONGO_DB_URL).then(async () => {
  const User = require('./models/User');

  // Link Uganda Number (+256701205308) to client accounts
  await User.updateOne({ email: 'pandropaul.pp17@gmail.com' }, { $set: { phone: '+256701205308' } });
  await User.updateOne({ email: 'sophia2026@gmail.com' }, { $set: { phone: '+256701205308' } });
  await User.updateOne({ email: 'sentemacamera@gmail.com' }, { $set: { phone: '+256701205308' } });

  // Link Pakistani Number to Awais accounts
  await User.updateOne({ email: 'mawais01980@gmail.com' }, { $set: { phone: '+923180505202' } });
  await User.updateOne({ email: 'mawais01890@gmail.com' }, { $set: { phone: '+923180505202' } });

  console.log('✅ Accounts successfully updated with verified numbers!');

  const users = await User.find({ phone: { $exists: true, $ne: null, $ne: '' } }).select('name email role phone');
  console.log('\n📱 Configured User Accounts:');
  users.forEach(u => console.log(' ', (u.role || '').padEnd(10), (u.email || '').padEnd(30), '->', u.phone));

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
