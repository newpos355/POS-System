require('dotenv').config();
const twilio = require('twilio');

async function testTwilio() {
  console.log('Testing Twilio Client Init with:');
  console.log('ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
  console.log('API_KEY:', process.env.TWILIO_API_KEY);
  console.log('MESSAGING_SERVICE_SID:', process.env.TWILIO_MESSAGING_SERVICE_SID);

  const client = twilio(process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET, {
    accountSid: process.env.TWILIO_ACCOUNT_SID
  });

  try {
    const msg = await client.messages.create({
      body: 'ApexPOS test message',
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      to: '+923180505202'
    });
    console.log('✅ Twilio SUCCESS! SID:', msg.sid, 'Status:', msg.status);
  } catch (err) {
    console.error('❌ Twilio Error:', err.message, 'Code:', err.code, 'Status:', err.status);
  }
}

testTwilio();
