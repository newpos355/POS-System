require('dotenv').config();
const mongoose = require('dns').setServers(['8.8.8.8', '1.1.1.1']);
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testSuite() {
  console.log('🧪 Starting Full Phone & OTP Lifecycle Test...\n');

  // Test 1: Request OTP for UNREGISTERED phone
  console.log('--- TEST 1: Unregistered Phone Rejection ---');
  try {
    await axios.post(`${BASE_URL}/auth/otp/send`, { phone: '+923999999999' });
    console.error('❌ Test 1 FAILED: Unregistered phone should not receive OTP!');
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.log('✅ Test 1 PASSED: Unregistered phone rejected with 404:', err.response.data.message);
    } else {
      console.log('❓ Test 1 Unexpected status:', err.response?.status, err.response?.data);
    }
  }

  // Test 2: Register a new business with phone
  console.log('\n--- TEST 2: Register New Business with Phone ---');
  const testEmail = `teststore_${Date.now()}@mekapos.com`;
  const testPhone = '+256701205308'; // Uganda verified
  let registeredUser = null;
  try {
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      businessName: 'Kampala Express Supermarket',
      name: 'John Paul',
      email: testEmail,
      phone: testPhone,
      password: 'Password123!',
    });
    console.log('✅ Test 2 PASSED: Registered user:', regRes.data.data.name, '| Phone registered!');
    registeredUser = regRes.data.data;
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
  }

  // Test 3: Request OTP for REGISTERED phone (+923180505202 or +256701205308)
  console.log('\n--- TEST 3: Registered Phone OTP Dispatch ---');
  try {
    const sendRes = await axios.post(`${BASE_URL}/auth/otp/send`, { phone: '+256701205308' });
    console.log('✅ Test 3 PASSED: OTP successfully dispatched to registered user!', sendRes.data);
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
  }

  console.log('\n🎉 ALL VALIDATION TESTS COMPLETED!');
}

testSuite().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
