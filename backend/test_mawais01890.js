const axios = require('axios');

async function testMawais01890() {
  try {
    const res = await axios.post('https://posmeka.com/api/auth/login', {
      email: 'mawais01890@gmail.com',
      password: 'Awais123@',
    });
    console.log('✅ LIVE LOGIN SUCCESS for mawais01890@gmail.com:', res.data.data.name, res.data.data.role);
  } catch (err) {
    console.error('❌ LIVE LOGIN FAILED for mawais01890@gmail.com:', err.response?.data);
  }
}

testMawais01890();
