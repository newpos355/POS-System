const axios = require('axios');

async function testAllPasswordsOnLive() {
  const email = 'mawais01980@gmail.com';
  const passwords = ['Awais123@', 'Mekapos@2026', 'Password123!', 'Mekapos2026', 'Awais@123'];

  for (const p of passwords) {
    try {
      const res = await axios.post('https://posmeka.com/api/auth/login', {
        email,
        password: p,
      });
      console.log(`✅ LIVE LOGIN SUCCESS with password: "${p}"`);
      return;
    } catch (err) {
      console.log(`❌ FAILED with password: "${p}" (Status: ${err.response?.status})`);
    }
  }

  // Also test other accounts
  const accounts = [
    { email: 'superadmin@posplatform.com', password: 'Password123!' },
    { email: 'pandropaul.pp17@gmail.com', password: 'Password123!' },
    { email: 'pandropaul.pp17@gmail.com', password: 'Mekapos@2026' },
    { email: 'admin@pos.com', password: 'Password123!' },
  ];

  console.log('\nTesting other known accounts on live posmeka.com:');
  for (const acc of accounts) {
    try {
      const res = await axios.post('https://posmeka.com/api/auth/login', acc);
      console.log(`✅ LIVE LOGIN SUCCESS for ${acc.email} with "${acc.password}"`);
    } catch (err) {
      console.log(`❌ FAILED for ${acc.email} with "${acc.password}" (Status: ${err.response?.status})`);
    }
  }
}

testAllPasswordsOnLive();
