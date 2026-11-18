const axios = require('axios');

async function testLiveLogin() {
  console.log('Testing live health check at https://posmeka.com/api/health...');
  try {
    const health = await axios.get('https://posmeka.com/api/health', { timeout: 10000 });
    console.log('✅ Live Health response:', health.status, health.data);
  } catch (err) {
    console.error('❌ Live Health error:', err.response?.status, err.response?.data || err.message);
  }

  console.log('\nTesting live login at https://posmeka.com/api/auth/login...');
  try {
    const res = await axios.post('https://posmeka.com/api/auth/login', {
      email: 'mawais01890@gmail.com',
      password: 'Mekapos@2026',
    }, { timeout: 10000 });
    console.log('✅ Live Login SUCCESS:', res.status, res.data);
  } catch (err) {
    console.error('❌ Live Login FAILED:', err.response?.status, err.response?.data || err.message);
  }
}

testLiveLogin();
