const axios = require('axios');

const key = 'TDpigBOOhs+zAl8cwH2Fl82jJGyD8xev';
const secret = '1KpqkfsMaihIcOlhnBo/gBZ5smw=';

async function testSubmitOnBaseUrl(baseUrl, name) {
  console.log(`\n==============================================`);
  console.log(`Testing Base URL [${name}]: ${baseUrl}`);
  console.log(`==============================================`);

  try {
    // 1. Auth
    const authRes = await axios.post(`${baseUrl}/api/Auth/RequestToken`, {
      consumer_key: key,
      consumer_secret: secret,
    });
    const token = authRes.data.token;
    console.log(`1. Auth Token:`, token ? 'OK' : 'FAILED');

    // 2. IPN List or Register
    let ipnId = '';
    const ipnListRes = await axios.get(`${baseUrl}/api/URLSetup/GetIpnList`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`2. Registered IPNs Count:`, Array.isArray(ipnListRes.data) ? ipnListRes.data.length : 'none');
    
    if (Array.isArray(ipnListRes.data) && ipnListRes.data.length > 0) {
      ipnId = ipnListRes.data[0].ipn_id;
    } else {
      const regRes = await axios.post(`${baseUrl}/api/URLSetup/RegisterIPN`, {
        url: 'https://webhook.site/pesapal-test-ug',
        ipn_notification_type: 'GET',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      ipnId = regRes.data.ipn_id;
    }
    console.log(`   Selected IPN ID:`, ipnId);

    // 3. Submit Order
    const orderPayload = {
      id: `POS-TEST-${Date.now()}`,
      currency: 'UGX',
      amount: 1000,
      description: 'Test POS Payment',
      callback_url: 'http://localhost:5000/api/pesapal/callback',
      notification_id: ipnId,
      billing_address: {
        email_address: 'john.doe@example.com',
        phone_number: '0770000000',
        country_code: 'UG',
        first_name: 'John',
        last_name: 'Doe',
      },
    };

    const submitRes = await axios.post(`${baseUrl}/api/Transactions/SubmitOrderRequest`, orderPayload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`3. Submit Order Response:`, submitRes.data);

    // Fetch the iframe content to see if it returns 200 or consumer_key_unknown error
    if (submitRes.data?.redirect_url) {
      console.log(`4. Testing Redirect URL fetch...`);
      const iframePage = await axios.get(submitRes.data.redirect_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });
      const hasError = iframePage.data.includes('consumer_key_unknown');
      console.log(`   Page Has consumer_key_unknown Error? ->`, hasError ? '❌ YES (ERROR)' : '✅ NO (WORKING PERFECTLY!)');
    }

  } catch (err) {
    console.log(`❌ Error on ${name}:`, err.response?.data || err.message);
  }
}

async function main() {
  await testSubmitOnBaseUrl('https://cybqa.pesapal.com/pesapalv3', 'Sandbox cybqa');
  await testSubmitOnBaseUrl('https://pay.pesapal.com/v3', 'Production pay.pesapal.com');
}

main();
