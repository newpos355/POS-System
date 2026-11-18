const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ─── Supported African Countries ────────────────────────────────────────────
const AFRICA_COUNTRIES = {
  UG: { name: 'Uganda', currency: 'UGX', airtelCode: 'UG', mtnCode: 'UG', phonePrefix: '256' },
  GH: { name: 'Ghana', currency: 'GHS', airtelCode: 'GH', mtnCode: 'GH', phonePrefix: '233' },
  KE: { name: 'Kenya', currency: 'KES', airtelCode: 'KE', mtnCode: null, phonePrefix: '254' },
  TZ: { name: 'Tanzania', currency: 'TZS', airtelCode: 'TZ', mtnCode: null, phonePrefix: '255' },
  ZM: { name: 'Zambia', currency: 'ZMW', airtelCode: 'ZM', mtnCode: 'ZM', phonePrefix: '260' },
  RW: { name: 'Rwanda', currency: 'RWF', airtelCode: 'RW', mtnCode: 'RW', phonePrefix: '250' },
  CM: { name: 'Cameroon', currency: 'XAF', airtelCode: null, mtnCode: 'CM', phonePrefix: '237' },
  CI: { name: "Cote d'Ivoire", currency: 'XOF', airtelCode: null, mtnCode: 'CI', phonePrefix: '225' },
  NG: { name: 'Nigeria', currency: 'NGN', airtelCode: 'NG', mtnCode: 'NG', phonePrefix: '234' },
};

const AIRTEL_BASE = process.env.AIRTEL_BASE_URL || 'https://openapi.airtel.africa';
const AIRTEL_CLIENT_ID = process.env.AIRTEL_CLIENT_ID || '';
const AIRTEL_CLIENT_SECRET = process.env.AIRTEL_CLIENT_SECRET || '';

const MTN_BASE = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const MTN_SUBSCRIPTION_KEY = process.env.MTN_SUBSCRIPTION_KEY || '';
const MTN_API_USER = process.env.MTN_API_USER || '';
const MTN_API_KEY = process.env.MTN_API_KEY || '';
const MTN_ENV = process.env.MTN_ENV || 'sandbox';

async function getAirtelToken() {
  const res = await axios.post(`${AIRTEL_BASE}/auth/oauth2/token`, {
    client_id: AIRTEL_CLIENT_ID,
    client_secret: AIRTEL_CLIENT_SECRET,
    grant_type: 'client_credentials',
  }, { headers: { 'Content-Type': 'application/json' } });
  return res.data.access_token;
}

async function getMTNToken() {
  const credentials = Buffer.from(`${MTN_API_USER}:${MTN_API_KEY}`).toString('base64');
  const res = await axios.post(`${MTN_BASE}/collection/token/`, {}, {
    headers: {
      Authorization: `Basic ${credentials}`,
      'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
    },
  });
  return res.data.access_token;
}

exports.initiateAirtelPayment = async (req, res) => {
  try {
    const { phone, amount, currency, country, reference, customerName } = req.body;

    if (!phone || !amount || !country) {
      return res.status(400).json({ success: false, message: 'Phone, amount, and country are required.' });
    }

    const countryInfo = AFRICA_COUNTRIES[country];
    if (!countryInfo || !countryInfo.airtelCode) {
      return res.status(400).json({ success: false, message: `Airtel Money not available in ${country}.` });
    }

    const transactionId = uuidv4();

    if (AIRTEL_CLIENT_ID && AIRTEL_CLIENT_SECRET) {
      try {
        const token = await getAirtelToken();
        await axios.post(`${AIRTEL_BASE}/merchant/v1/payments/`, {
          reference,
          subscriber: {
            country: countryInfo.airtelCode,
            currency: currency || countryInfo.currency,
            msisdn: phone.replace(/^0/, countryInfo.phonePrefix),
          },
          transaction: {
            amount: Number(amount),
            country: countryInfo.airtelCode,
            currency: currency || countryInfo.currency,
            id: transactionId,
          },
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Country': countryInfo.airtelCode,
            'X-Currency': currency || countryInfo.currency,
          },
        });

        return res.json({
          success: true,
          provider: 'airtel',
          transactionId,
          message: `Payment request sent to ${phone}. Ask customer to confirm USSD prompt.`,
          status: 'pending',
        });
      } catch (apiErr) {
        console.warn('Airtel API error, sandbox fallback:', apiErr.message);
      }
    }

    // Sandbox/Demo simulation
    demoTransactions.set(transactionId, Date.now());
    res.json({
      success: true,
      provider: 'airtel',
      transactionId,
      message: `[SANDBOX] Payment request sent to ${phone}. Customer will receive USSD *185# prompt.`,
      status: 'pending',
      demo: true,
    });
  } catch (error) {
    console.error('Airtel payment error:', error);
    res.status(500).json({ success: false, message: error.message || 'Airtel Money payment initiation failed.' });
  }
};

exports.initiateMTNPayment = async (req, res) => {
  try {
    const { phone, amount, currency, country, reference, customerName } = req.body;

    if (!phone || !amount || !country) {
      return res.status(400).json({ success: false, message: 'Phone, amount, and country are required.' });
    }

    const countryInfo = AFRICA_COUNTRIES[country];
    if (!countryInfo || !countryInfo.mtnCode) {
      return res.status(400).json({ success: false, message: `MTN Mobile Money not available in ${country}.` });
    }

    const transactionId = uuidv4();

    if (MTN_SUBSCRIPTION_KEY && MTN_API_USER && MTN_API_KEY) {
      try {
        const token = await getMTNToken();
        await axios.post(`${MTN_BASE}/collection/v1_0/requesttopay`, {
          amount: String(Number(amount)),
          currency: currency || countryInfo.currency,
          externalId: reference || transactionId,
          payer: {
            partyIdType: 'MSISDN',
            partyId: phone.replace(/^0/, countryInfo.phonePrefix),
          },
          payerMessage: `POS Payment - ${reference}`,
          payeeNote: customerName || 'POS Platform Customer',
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Reference-Id': transactionId,
            'X-Target-Environment': MTN_ENV,
            'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
            'Content-Type': 'application/json',
          },
        });

        return res.json({
          success: true,
          provider: 'mtn',
          transactionId,
          message: `Payment request sent to ${phone}. Ask customer to approve on their phone.`,
          status: 'pending',
        });
      } catch (apiErr) {
        console.warn('MTN MoMo API error, sandbox fallback:', apiErr.message);
      }
    }

    // Sandbox/Demo simulation
    demoTransactions.set(transactionId, Date.now());
    res.json({
      success: true,
      provider: 'mtn',
      transactionId,
      message: `[SANDBOX] MTN MoMo request sent to ${phone}. Customer will approve on phone.`,
      status: 'pending',
      demo: true,
    });
  } catch (error) {
    console.error('MTN MoMo payment error:', error);
    res.status(500).json({ success: false, message: error.message || 'MTN MoMo payment initiation failed.' });
  }
};

// In-memory store for tracking demo transaction timestamps
const demoTransactions = new Map();

exports.recordDemoTransaction = (txId) => {
  demoTransactions.set(txId, Date.now());
};

exports.checkPaymentStatus = async (req, res) => {
  const { provider, transactionId } = req.params;

  try {
    if (provider === 'airtel' && AIRTEL_CLIENT_ID && AIRTEL_CLIENT_SECRET) {
      const token = await getAirtelToken();
      const statusRes = await axios.get(`${AIRTEL_BASE}/standard/v1/payments/${transactionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const txStatus = statusRes.data && statusRes.data.data && statusRes.data.data.transaction && statusRes.data.data.transaction.status;
      return res.json({
        success: true,
        status: txStatus === 'TS' ? 'confirmed' : txStatus === 'TF' ? 'failed' : 'pending',
      });
    }

    if (provider === 'mtn' && MTN_SUBSCRIPTION_KEY && MTN_API_USER && MTN_API_KEY) {
      const token = await getMTNToken();
      const statusRes = await axios.get(`${MTN_BASE}/collection/v1_0/requesttopay/${transactionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': MTN_ENV,
          'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
        },
      });
      const txStatus = statusRes.data && statusRes.data.status;
      return res.json({
        success: true,
        status: txStatus === 'SUCCESSFUL' ? 'confirmed' : txStatus === 'FAILED' ? 'failed' : 'pending',
      });
    }

    // Demo/Sandbox Mode: Keep pending for at least 12 seconds to simulate real USSD PIN entry delay
    const startTime = demoTransactions.get(transactionId) || Date.now();
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    if (elapsedSeconds >= 12) {
      return res.json({ success: true, status: 'confirmed', demo: true });
    } else {
      return res.json({ success: true, status: 'pending', demo: true, secondsRemaining: Math.ceil(12 - elapsedSeconds) });
    }
  } catch (error) {
    console.error('Payment status check error:', error.message);
    res.json({ success: true, status: 'pending' });
  }
};

const SalesOrder = require('../models/SalesOrder');

exports.airtelCallback = async (req, res) => {
  try {
    console.log('Airtel Money Callback:', JSON.stringify(req.body));
    const { transaction } = req.body || {};
    if (transaction) {
      const { id, status, reference } = transaction;
      const isSuccess = status === 'TS' || status === 'SUCCESS' || status === 'COMPLETED';
      await SalesOrder.findOneAndUpdate(
        { $or: [{ orderNumber: reference }, { 'paymentDetails.momoTransactionId': id }] },
        {
          paymentStatus: isSuccess ? 'COMPLETED' : 'FAILED',
          status: isSuccess ? 'completed' : 'voided',
          'paymentDetails.momoTransactionId': id,
        }
      );
    }
    res.status(200).json({ status: 'received' });
  } catch (err) {
    console.error('Airtel callback error:', err);
    res.status(200).json({ status: 'error' });
  }
};

exports.mtnCallback = async (req, res) => {
  try {
    console.log('MTN MoMo Callback:', JSON.stringify(req.body));
    const { financialTransactionId, status, externalId } = req.body || {};
    const isSuccess = status === 'SUCCESSFUL' || status === 'SUCCESS' || status === 'COMPLETED';
    if (externalId || financialTransactionId) {
      await SalesOrder.findOneAndUpdate(
        { $or: [{ orderNumber: externalId }, { 'paymentDetails.momoTransactionId': financialTransactionId }] },
        {
          paymentStatus: isSuccess ? 'COMPLETED' : 'FAILED',
          status: isSuccess ? 'completed' : 'voided',
          'paymentDetails.momoTransactionId': financialTransactionId,
        }
      );
    }
    res.status(200).json({ status: 'received' });
  } catch (err) {
    console.error('MTN callback error:', err);
    res.status(200).json({ status: 'error' });
  }
};

// Generic 3rd Party Webhook Handler (Yo! Payments, Beyonic, Flutterwave, etc.)
exports.genericMomoCallback = async (req, res) => {
  const { transactionId, status, externalReference } = req.body || {};

  try {
    const isSuccess = status === 'SUCCESS' || status === 'COMPLETED' || status === 'SUCCESSFUL';
    if (externalReference || transactionId) {
      await SalesOrder.findOneAndUpdate(
        { $or: [{ orderNumber: externalReference }, { 'paymentDetails.momoTransactionId': transactionId }] },
        {
          paymentStatus: isSuccess ? 'COMPLETED' : 'FAILED',
          status: isSuccess ? 'completed' : 'voided',
          'paymentDetails.momoTransactionId': transactionId,
        }
      );
    }
    return res.status(200).json({ message: "Callback processed successfully" });
  } catch (error) {
    console.error('Generic MoMo callback error:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getCountries = (req, res) => {
  res.json({
    success: true,
    data: Object.entries(AFRICA_COUNTRIES).map(([code, info]) => ({ code, ...info })),
  });
};
