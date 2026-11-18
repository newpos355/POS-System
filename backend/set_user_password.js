require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function setPassword() {
  await mongoose.connect(process.env.MONGO_DB_URL);
  const User = require('./models/User');

  const users = await User.find({ email: { $in: ['mawais01980@gmail.com', 'mawais01890@gmail.com'] } });
  for (const user of users) {
    user.password = 'Awais123@';
    await user.save();
    console.log(`✅ Password updated to "Awais123@" for ${user.email} (${user.name})`);
  }

  process.exit(0);
}

setPassword().catch(e => { console.error(e); process.exit(1); });
