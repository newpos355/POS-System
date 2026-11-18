/**
 * POS Platform — Database Seeder
 * 
 * Run once to create your first real admin account and seed initial data.
 * Usage: node backend/seeders/seed.js
 * 
 * This will create:
 * ✅ 1 Tenant (your business)
 * ✅ 1 Admin User
 * ✅ 1 Main Branch
 * ✅ 5 Categories
 * ✅ 10 Sample Products with Inventory
 */

const mongoose = require('mongoose');
const readline = require('readline');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  title: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

async function seed() {
  log.title('═══════════════════════════════════════════');
  log.title('   POS Platform — Database Seeder');
  log.title('═══════════════════════════════════════════');

  // Connect to MongoDB
  try {
    log.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_DB_URL, {
      serverSelectionTimeoutMS: 10000,
    });
    log.success('MongoDB Connected!');
  } catch (err) {
    log.error(`Cannot connect to MongoDB: ${err.message}`);
    log.warn('Make sure your MONGO_DB_URL in .env is correct and Atlas IP is whitelisted.');
    process.exit(1);
  }

  // Collect input or use defaults if --auto flag passed
  const isAuto = process.argv.includes('--auto');
  let businessName, ownerName, email, password;

  if (isAuto) {
    businessName = 'Retail Store Official';
    ownerName = 'Store Admin';
    email = 'admin@pos.com';
    password = 'adminpassword123';
    console.log('🤖 Auto-seeding with default credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}\n`);
  } else {
    console.log('\n📋 Enter your business details:\n');
    businessName = await ask('Business Name (e.g., "My Retail Store"): ');
    ownerName = await ask('Your Name: ');
    email = await ask('Admin Email: ');
    password = await ask('Admin Password (min 6 chars): ');
    console.log('');
  }

  if (!businessName || !ownerName || !email || !password || password.length < 6) {
    log.error('All fields are required and password must be at least 6 characters.');
    process.exit(1);
  }

  try {
    // ─── TENANT ────────────────────────────────────────────────────────────────
    let tenant = await Tenant.findOne({ email });
    if (tenant) {
      log.warn(`Tenant already exists for ${email}. Skipping tenant creation.`);
    } else {
      tenant = await Tenant.create({
        name: businessName,
        email,
        settings: { currency: 'USD', taxRate: 0, timezone: 'UTC' },
      });
      log.success(`Tenant created: ${tenant.name}`);
    }

    // ─── ADMIN USER ─────────────────────────────────────────────────────────────
    let user = await User.findOne({ email, tenantId: tenant._id });
    if (user) {
      log.warn(`Admin user already exists. Skipping.`);
    } else {
      user = await User.create({
        tenantId: tenant._id,
        name: ownerName,
        email,
        password,
        role: 'admin',
      });
      log.success(`Admin user created: ${user.name} (${user.email})`);
    }

    // ─── BRANCH ─────────────────────────────────────────────────────────────────
    let branch = await Branch.findOne({ tenantId: tenant._id, isDefault: true })
      || await Branch.findOne({ tenantId: tenant._id });

    if (branch) {
      log.warn(`Branch already exists: ${branch.name}. Skipping.`);
    } else {
      branch = await Branch.create({
        tenantId: tenant._id,
        name: 'Main Branch',
        address: 'Main Location',
        phone: '',
        isDefault: true,
      });
      log.success(`Branch created: ${branch.name}`);
    }

    // ─── CATEGORIES ─────────────────────────────────────────────────────────────
    const categoryDefs = [
      { name: 'Electronics', description: 'Gadgets, phones, TVs and accessories' },
      { name: 'Groceries', description: 'Fresh produce, dairy, bakery and essentials' },
      { name: 'Clothing', description: 'Men, women, kids fashion and footwear' },
      { name: 'Beverages', description: 'Soft drinks, juices, coffee and tea' },
      { name: 'Home & Office', description: 'Furniture, stationery and kitchen items' },
    ];

    const categories = {};
    for (const catDef of categoryDefs) {
      let cat = await Category.findOne({ name: catDef.name, tenantId: tenant._id });
      if (!cat) {
        cat = await Category.create({ ...catDef, tenantId: tenant._id });
        log.success(`Category created: ${cat.name}`);
      } else {
        log.warn(`Category already exists: ${cat.name}`);
      }
      categories[cat.name] = cat._id;
    }

    // ─── PRODUCTS + INVENTORY ───────────────────────────────────────────────────
    const productDefs = [
      { name: 'iPhone 15 Pro 128GB', sku: 'IPH-15-PRO-128', price: 999.00, costPrice: 750.00, stock: 20, reorderLevel: 5, categoryName: 'Electronics', barcode: '8901234567890' },
      { name: 'Samsung 55" 4K Smart TV', sku: 'SAM-TV-55-4K', price: 649.99, costPrice: 480.00, stock: 10, reorderLevel: 3, categoryName: 'Electronics', barcode: '8901234567891' },
      { name: 'Wireless Bluetooth Headphones', sku: 'WBH-PRO-001', price: 89.99, costPrice: 45.00, stock: 30, reorderLevel: 10, categoryName: 'Electronics', barcode: '8901234567892' },
      { name: 'Organic Whole Milk 1L', sku: 'GRC-MILK-1L', price: 3.49, costPrice: 2.10, stock: 100, reorderLevel: 20, categoryName: 'Groceries', barcode: '8901234567893' },
      { name: 'Sourdough Bread Loaf', sku: 'GRC-BREAD-SDO', price: 5.99, costPrice: 3.00, stock: 50, reorderLevel: 15, categoryName: 'Groceries', barcode: '8901234567894' },
      { name: 'Nike Air Max Sneakers', sku: 'CLT-NIKE-AM', price: 129.99, costPrice: 75.00, stock: 25, reorderLevel: 8, categoryName: 'Clothing', barcode: '8901234567895' },
      { name: "Levi's 501 Jeans", sku: 'CLT-LEVI-501', price: 69.99, costPrice: 35.00, stock: 40, reorderLevel: 10, categoryName: 'Clothing', barcode: '8901234567896' },
      { name: 'Coca Cola 2L', sku: 'BEV-COKE-2L', price: 2.49, costPrice: 1.20, stock: 200, reorderLevel: 30, categoryName: 'Beverages', barcode: '8901234567897' },
      { name: 'Red Bull Energy Drink 250ml', sku: 'BEV-RB-250', price: 3.99, costPrice: 2.00, stock: 120, reorderLevel: 24, categoryName: 'Beverages', barcode: '8901234567898' },
      { name: 'A4 Paper Ream 500 Sheets', sku: 'OFF-PAPER-A4', price: 9.99, costPrice: 5.50, stock: 80, reorderLevel: 20, categoryName: 'Home & Office', barcode: '8901234567899' },
    ];

    for (const prodDef of productDefs) {
      const { categoryName, ...productData } = prodDef;
      const existingProd = await Product.findOne({ sku: productData.sku, tenantId: tenant._id });

      if (existingProd) {
        log.warn(`Product already exists: ${productData.name}`);
        continue;
      }

      const product = await Product.create({
        ...productData,
        tenantId: tenant._id,
        categoryId: categories[categoryName],
        status: 'Active',
        isActive: true,
        unit: 'piece',
      });

      // Create inventory record
      await Inventory.findOneAndUpdate(
        { productId: product._id, branchId: branch._id, tenantId: tenant._id },
        { $set: { quantity: productData.stock, reorderLevel: productData.reorderLevel, lastUpdated: new Date() } },
        { upsert: true, new: true }
      );

      log.success(`Product + Inventory created: ${product.name} (Stock: ${productData.stock})`);
    }

    // ─── SUMMARY ────────────────────────────────────────────────────────────────
    console.log('\n');
    log.title('═══════════════════════════════════════════');
    log.title('   🎉 Seeder Complete!');
    log.title('═══════════════════════════════════════════');
    console.log(`\n${colors.bold}Login credentials:${colors.reset}`);
    console.log(`   Email:    ${colors.green}${email}${colors.reset}`);
    console.log(`   Password: ${colors.green}${password}${colors.reset}`);
    console.log(`   Role:     ${colors.green}Admin${colors.reset}`);
    console.log(`\n${colors.bold}URL:${colors.reset} ${colors.cyan}http://localhost:5173${colors.reset}`);
    console.log('\n');

  } catch (err) {
    log.error(`Seeder failed: ${err.message}`);
    console.error(err);
  } finally {
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
