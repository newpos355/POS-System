const mongoose = require('mongoose');
const dns = require('dns');

// On Windows local development, set public DNS. In production Linux (Hostinger), use system DNS
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    dns.setDefaultResultOrder('ipv4first');
  } catch (e) {
    console.warn('DNS setServers warning:', e.message);
  }
}

const connectDB = async () => {
  const uri = process.env.MONGO_DB_URL;

  if (!uri) {
    console.error('MONGO_DB_URL not set in .env');
    return;
  }

  const connectWithRetry = async (attempt = 1) => {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        w: 'majority',
      });
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
      console.error(`⚠️ MongoDB attempt ${attempt} failed: ${err.message}`);
      // Never give up: an Atlas blip at boot used to strand the server alive
      // but permanently DB-less (every API answering 503 until a manual
      // restart). Fast retries first, then a steady 15s cadence forever.
      const delay = attempt < 5 ? 2000 : 15000;
      console.log(`🔄 Retrying in ${delay / 1000} seconds (attempt ${attempt + 1})...`);
      setTimeout(() => connectWithRetry(attempt + 1), delay);
    }
  };

  await connectWithRetry();

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Reconnecting...');
    setTimeout(() => connectWithRetry(1), 2000);
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected.');
  });
};

module.exports = connectDB;
