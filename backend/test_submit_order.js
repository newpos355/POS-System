const axios = require('axios');

const key = 'TDpigBOOhs+zAl8cwH2Fl82jJGyD8xev';
const secret = '1KpqkfsMaihIcOlhnBo/gBZ5smw=';
const BASE_URL = 'https://cybqa.pesapal.com/pesapalv3';

async function testFullFlow() {
  console.log('--- 1. Requesting Token ---');
  const tokenRes = await axios.post(`${BASE_URL}/api/Auth/RequestToken`, {
    consumer_key: key,
    consumer_secret: secret,
  });
  const token = tokenRes.data.token;
  console.log('Token:', token ? 'GOT TOKEN' : 'FAILED');

  console.log('\n--- 2. Registering IPN ---');
  let ipnId = '';
  try {
    const ipnRes = await axios.post(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
      url: 'https://webhook.site/test-pesapal-pos',
      ipn_notification_type: 'GET',
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    console.log('IPN Response:', ipnRes.data);
    ipnId = ipnRes.data.ipn_id;
  } catch (e) {
    console.log('IPN Error:', e.response?.data || e.message);
  }

  if (!ipnId) {
    console.log('Fetching existing IPNs...');
    const listRes = await axios.get(`${BASE_URL}/api/URLSetup/GetIpnList`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    console.log('IPN List:', listRes.data);
    if (Array.isArray(listRes.data) && listRes.data.length > 0) {
      ipnId = listRes.data[0].ipn_id;
    }
  }

  console.log('\n--- 3. Submitting Order Request ---');
  const orderRef = `POS-TEST-${Date.now()}`;
  const orderPayload = {
    id: orderRef,
    currency: 'UGX',
    amount: 5000,
    description: 'POS Uganda Payment Test',
    callback_url: 'http://localhost:5000/api/pesapal/callback',
    notification_id: ipnId,
    billing_address: {
      email_address: 'test@example.com',
      phone_number: '0771234567',
      country_code: 'UG',
      first_name: 'John',
      last_name: 'Doe',
    },
  };

  try {
    const submitRes = await axios.post(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, orderPayload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    console.log('Submit Order Response:', submitRes.data);
  } catch (e) {
    console.log('Submit Order Error:', e.response?.data || e.message);
  }
}

testFullFlow();
