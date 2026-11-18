const axios = require('axios');

const key = 'TDpigBOOhs+zAl8cwH2Fl82jJGyD8xev';
const secret = '1KpqkfsMaihIcOlhnBo/gBZ5smw=';

const urls = [
  'https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken',
  'https://cyb.pesapal.com/pesapalv3/api/Auth/RequestToken',
  'https://pay.pesapal.com/v3/api/Auth/RequestToken',
];

async function check() {
  for (const url of urls) {
    console.log(`Testing URL: ${url}`);
    try {
      const res = await axios.post(url, {
        consumer_key: key,
        consumer_secret: secret,
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      });
      console.log(`✅ SUCCESS on ${url}:`, res.data);
    } catch (err) {
      console.log(`❌ FAILED on ${url}:`, err.response?.status, err.response?.data || err.message);
    }
  }
}

check();
