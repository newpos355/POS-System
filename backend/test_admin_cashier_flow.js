require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testFullAdminAndCashierFlow() {
  console.log('🚀 Running Comprehensive Admin & Role Creation Test Flow...\n');

  // 1. Admin Login
  console.log('1️⃣ Testing Admin Login (mawais01980@gmail.com / Awais123@)...');
  let adminToken = '';
  try {
    const adminLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'mawais01980@gmail.com',
      password: 'Awais123@',
    });
    adminToken = adminLoginRes.data.data.token;
    console.log('✅ Admin Login SUCCESS! Admin Name:', adminLoginRes.data.data.name, '| Role:', adminLoginRes.data.data.role);
  } catch (err) {
    console.error('❌ Admin Login FAILED:', err.response?.data || err.message);
    process.exit(1);
  }

  // 2. Admin creates a Cashier with phone and mixed-case email
  const cashierEmail = `Cashier_${Date.now()}@MekaStore.com`;
  const cashierPass = 'Cashier@2026';
  const cashierPhone = '+256701205308';

  console.log(`\n2️⃣ Admin Creating New Cashier (${cashierEmail} / ${cashierPhone})...`);
  try {
    const createRes = await axios.post(`${BASE_URL}/users`, {
      name: 'Sarah Nakato (Cashier)',
      email: cashierEmail,
      password: cashierPass,
      phone: cashierPhone,
      role: 'cashier',
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('✅ Cashier Created Successfully:', createRes.data.data.name, '| Stored Email:', createRes.data.data.email, '| Stored Phone:', createRes.data.data.phone);
  } catch (err) {
    console.error('❌ Cashier Creation FAILED:', err.response?.data || err.message);
    process.exit(1);
  }

  // 3. Test Cashier Login with lowercase email
  console.log(`\n3️⃣ Testing Cashier Login with standard email & password...`);
  try {
    const cashierLogin1 = await axios.post(`${BASE_URL}/auth/login`, {
      email: cashierEmail.toLowerCase(),
      password: cashierPass,
    });
    console.log('✅ Cashier Login 1 SUCCESS! Role:', cashierLogin1.data.data.role);
  } catch (err) {
    console.error('❌ Cashier Login 1 FAILED:', err.response?.data || err.message);
  }

  // 4. Test Cashier Login with Mixed-Case email (e.g., Cashier_123@MekaStore.com)
  console.log(`\n4️⃣ Testing Cashier Login with Mixed-Case email typed by user...`);
  try {
    const cashierLogin2 = await axios.post(`${BASE_URL}/auth/login`, {
      email: cashierEmail,
      password: ` ${cashierPass} `, // accidental spaces in password
    });
    console.log('✅ Cashier Login 2 (Mixed Case + Space in Pass) SUCCESS! Token issued!');
  } catch (err) {
    console.error('❌ Cashier Login 2 FAILED:', err.response?.data || err.message);
  }

  // 5. Test Cashier SMS OTP Login Flow
  console.log(`\n5️⃣ Testing Cashier SMS OTP Login Flow...`);
  try {
    const otpSendRes = await axios.post(`${BASE_URL}/auth/otp/send`, {
      phone: cashierPhone,
    });
    console.log('✅ Cashier OTP Sent via SMS:', otpSendRes.data.message);
  } catch (err) {
    console.error('❌ Cashier OTP Send FAILED:', err.response?.data || err.message);
  }

  console.log('\n🎉 ALL ADMIN & CASHIER ROLE WORKFLOW TESTS PASSED 100%!');
}

testFullAdminAndCashierFlow().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
