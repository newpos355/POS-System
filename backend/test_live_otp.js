const axios = require('axios');

async function testLiveOTP() {
  console.log('Testing live OTP send for +923180505202 on posmeka.com...');
  try {
    const res = await axios.post('https://posmeka.com/api/auth/otp/send', {
      phone: '+923180505202'
    });
    console.log('✅ LIVE OTP SEND SUCCESS:', res.data);
  } catch (err) {
    console.error('❌ LIVE OTP SEND FAILED:', err.response?.data || err.message);
  }

  console.log('\nTesting unregistered phone rejection on posmeka.com...');
  try {
    await axios.post('https://posmeka.com/api/auth/otp/send', {
      phone: '+923999999999'
    });
    console.error('❌ ERROR: Should have rejected unregistered phone!');
  } catch (err) {
    console.log('✅ Unregistered phone correctly rejected with 404:', err.response?.data?.message);
  }
}

testLiveOTP();
