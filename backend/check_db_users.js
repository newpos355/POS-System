require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function checkUsers() {
  await mongoose.connect(process.env.MONGO_DB_URL);
  console.log('✅ Connected to MongoDB Atlas');

  const User = require('./models/User');
  const Tenant = require('./models/Tenant');

  const users = await User.find({});
  console.log(`Found ${users.length} total users in DB:`);
  for (const u of users) {
    console.log(`- Name: ${u.name} | Email: "${u.email}" | Role: ${u.role} | Active: ${u.isActive} | Phone: ${u.phone} | Tenant: ${u.tenantId}`);
  }

  const tenants = await Tenant.find({});
  console.log(`\nFound ${tenants.length} total tenants in DB:`);
  for (const t of tenants) {
    console.log(`- Tenant: ${t.name} | Email: "${t.email}" | Status: ${t.status} | Plan: ${t.plan}`);
  }

  process.exit(0);
}

checkUsers().catch(e => { console.error(e); process.exit(1); });
