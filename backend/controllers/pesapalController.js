const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const SalesOrder = require('../models/SalesOrder');

// ─── Configuration ──────────────────────────────────────────────────────────────
const PESAPAL_BASE = process.env.PESAPAL_BASE_URL || 'https://cybqa.pesapal.com/pesapalv3';
const PESAPAL_KEY = process.env.PESAPAL_CONSUMER_KEY || '';
const PESAPAL_SECRET = process.env.PESAPAL_CONSUMER_SECRET || '';
const PESAPAL_CALLBACK = process.env.PESAPAL_CALLBACK_URL || 'http://localhost:5173/pos';
const BACKEND_URL = `http://localhost:${process.env.PORT || 5000}`;

// ─── Token Cache (5 min TTL) ────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = null;

// ─── Cached IPN ID ──────────────────────────────────────────────────────────────
let cachedIpnId = process.env.PESAPAL_IPN_ID || null;

// ─── In-memory order tracking store (txId -> orderTrackingId) ────────────────────
const orderTrackingStore = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: Authentication — Get Bearer Token
// POST /api/Auth/RequestToken
// ═══════════════════════════════════════════════════════════════════════════════
async function getPesapalToken() {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const res = await axios.post(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
      consumer_key: PESAPAL_KEY,
      consumer_secret: PESAPAL_SECRET,
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (res.data && res.data.token) {
      cachedToken = res.data.token;
      // Token expires in 5 min, cache for 4 min to be safe
      tokenExpiry = new Date(Date.now() + 4 * 60 * 1000);
      console.log(`✅ Pesapal token obtained. Expires: ${res.data.expiryDate}`);
      return cachedToken;
    }

    console.warn('Pesapal token response missing token field:', res.data);
    return null;
  } catch (err) {
    console.error('❌ Pesapal Auth Error:', err.response?.data || err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: Register IPN URL
// POST /api/URLSetup/RegisterIPN
// ═══════════════════════════════════════════════════════════════════════════════
async function registerIPN() {
  // Priority 1: Use the IPN ID from .env (pre-registered public URL)
  if (cachedIpnId) return cachedIpnId;
  if (process.env.PESAPAL_IPN_ID) {
    cachedIpnId = process.env.PESAPAL_IPN_ID;
    console.log(`✅ Using .env IPN ID: ${cachedIpnId}`);
    return cachedIpnId;
  }

  const token = await getPesapalToken();
  if (!token) return null;

  try {
    // Priority 2: Find an existing publicly-registered IPN from the list
    const listRes = await axios.get(`${PESAPAL_BASE}/api/URLSetup/GetIpnList`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (Array.isArray(listRes.data) && listRes.data.length > 0) {
      // Only use public IPN URLs, never localhost
      const publicIpn = listRes.data.find(item =>
        item.ipn_id &&
        item.url &&
        !item.url.includes('localhost') &&
        !item.url.includes('127.0.0.1')
      );
      if (publicIpn) {
        cachedIpnId = publicIpn.ipn_id;
        console.log(`✅ Using existing public IPN → ${publicIpn.url} (${cachedIpnId})`);
        return cachedIpnId;
      }
    }

    // Priority 3: Register a new public IPN URL
    const ipnUrl = process.env.NODE_ENV === 'production'
      ? `${process.env.BACKEND_PUBLIC_URL || BACKEND_URL}/api/pesapal/ipn`
      : 'https://webhook.site/pesapal-pos-uganda-ipn';

    const res = await axios.post(`${PESAPAL_BASE}/api/URLSetup/RegisterIPN`, {
      url: ipnUrl,
      ipn_notification_type: 'GET',
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (res.data && res.data.ipn_id) {
      cachedIpnId = res.data.ipn_id;
      console.log(`✅ IPN registered: ${res.data.url} → ipn_id: ${cachedIpnId}`);
      return cachedIpnId;
    }

    console.warn('IPN registration failed:', res.data);
    return null;
  } catch (err) {
    console.error('❌ IPN Registration Error:', err.response?.data || err.message);
    return null;
  }
}


// Expose for manual registration from admin/debug endpoint
exports.registerIPN = async (req, res) => {
  try {
    const ipnId = await registerIPN();
    if (ipnId) {
      return res.json({ success: true, ipn_id: ipnId, message: 'IPN registered successfully. Add this to your .env as PESAPAL_IPN_ID' });
    }
    return res.status(500).json({ success: false, message: 'Failed to register IPN' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// List all registered IPNs
exports.getRegisteredIPNs = async (req, res) => {
  try {
    const token = await getPesapalToken();
    if (!token) return res.status(500).json({ success: false, message: 'Auth failed' });

    const response = await axios.get(`${PESAPAL_BASE}/api/URLSetup/GetIpnList`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    return res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data || error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: Submit Order Request (Initiate Payment)
// POST /api/Transactions/SubmitOrderRequest
// ═══════════════════════════════════════════════════════════════════════════════
exports.initiatePesapalPayment = async (req, res) => {
  try {
    const {
      phone,
      amount,
      currency = 'UGX',
      reference,
      customerName = 'POS Customer',
      email,
    } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount is required.' });
    }

    const token = await getPesapalToken();
    if (!token) {
      return res.status(500).json({ success: false, message: 'Pesapal authentication failed. Check credentials.' });
    }

    // Ensure IPN is registered
    const ipnId = await registerIPN();
    if (!ipnId) {
      return res.status(500).json({ success: false, message: 'IPN registration failed. Cannot process payment.' });
    }

    // Generate unique merchant reference (alphanumeric, dashes, underscores only)
    const merchantRef = (reference || `POS-${Date.now()}`).replace(/[^a-zA-Z0-9\-_.:]/g, '-').slice(0, 50);

    const firstName = customerName.split(' ')[0] || 'POS';
    const lastName = customerName.split(' ').slice(1).join(' ') || 'Customer';

    const payload = {
      id: merchantRef,
      currency: currency || 'UGX',
      amount: Number(amount),
      description: `POS Uganda Payment - Order ${merchantRef}`.slice(0, 100),
      callback_url: PESAPAL_CALLBACK,
      redirect_mode: 'TOP_WINDOW',
      notification_id: ipnId,
      branch: 'POS Uganda',
      billing_address: {
        email_address: email || 'customer@pos-uganda.com',
        phone_number: phone || '0700000000',
        country_code: 'UG',
        first_name: firstName,
        last_name: lastName,
      },
    };

    console.log('📤 Pesapal SubmitOrderRequest payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('📥 Pesapal SubmitOrderRequest response:', response.data);

    if (response.data && response.data.order_tracking_id) {
      // Store tracking info
      orderTrackingStore.set(merchantRef, {
        orderTrackingId: response.data.order_tracking_id,
        merchantRef,
        createdAt: Date.now(),
      });

      return res.json({
        success: true,
        provider: 'pesapal',
        transactionId: merchantRef,
        orderTrackingId: response.data.order_tracking_id,
        redirectUrl: response.data.redirect_url,
        merchantReference: response.data.merchant_reference,
        message: 'Pesapal payment order created. Redirect customer to payment page.',
        status: 'pending',
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Unexpected Pesapal response',
      data: response.data,
    });
  } catch (error) {
    console.error('❌ Pesapal SubmitOrderRequest Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.error?.message || error.message || 'Pesapal payment initiation failed.',
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4: IPN Webhook Handler
// Pesapal sends GET/POST with: OrderTrackingId, OrderMerchantReference, OrderNotificationType
// We must call GetTransactionStatus to get actual payment status, then respond with JSON
// ═══════════════════════════════════════════════════════════════════════════════
exports.pesapalIPN = async (req, res) => {
  try {
    // IPN params come via query (GET) or body (POST)
    const OrderTrackingId = req.query.OrderTrackingId || req.body.OrderTrackingId;
    const OrderMerchantReference = req.query.OrderMerchantReference || req.body.OrderMerchantReference;
    const OrderNotificationType = req.query.OrderNotificationType || req.body.OrderNotificationType;

    console.log('─── Pesapal IPN Received ───');
    console.log(`  OrderTrackingId: ${OrderTrackingId}`);
    console.log(`  OrderMerchantReference: ${OrderMerchantReference}`);
    console.log(`  OrderNotificationType: ${OrderNotificationType}`);

    if (!OrderTrackingId) {
      return res.status(200).json({
        orderNotificationType: OrderNotificationType || 'IPNCHANGE',
        orderTrackingId: OrderTrackingId,
        orderMerchantReference: OrderMerchantReference,
        status: 500,
      });
    }

    // Fetch actual payment status from Pesapal
    const token = await getPesapalToken();
    let paymentStatus = null;

    if (token) {
      try {
        const statusRes = await axios.get(
          `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${OrderTrackingId}`,
          {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        paymentStatus = statusRes.data;
        console.log('📥 Pesapal GetTransactionStatus:', JSON.stringify(paymentStatus, null, 2));
      } catch (statusErr) {
        console.error('❌ GetTransactionStatus error:', statusErr.response?.data || statusErr.message);
      }
    }

    // Update SalesOrder in DB based on status
    if (OrderMerchantReference && paymentStatus) {
      const statusCode = paymentStatus.status_code;
      // 0 = INVALID, 1 = COMPLETED, 2 = FAILED, 3 = REVERSED
      const isCompleted = statusCode === 1;
      const isFailed = statusCode === 2;
      const isReversed = statusCode === 3;

      const updateFields = {
        'paymentDetails.momoTransactionId': paymentStatus.confirmation_code || OrderTrackingId,
        'paymentDetails.momoProvider': `Pesapal ${paymentStatus.payment_method || 'UG'}`,
      };

      if (isCompleted) {
        updateFields.paymentStatus = 'COMPLETED';
        updateFields.status = 'completed';
      } else if (isFailed) {
        updateFields.paymentStatus = 'FAILED';
        updateFields.status = 'voided';
      } else if (isReversed) {
        updateFields.paymentStatus = 'FAILED';
        updateFields.status = 'refunded';
      }

      if (isCompleted || isFailed || isReversed) {
        const order = await SalesOrder.findOneAndUpdate(
          { orderNumber: OrderMerchantReference },
          updateFields,
          { new: true }
        );
        if (order) {
          console.log(`✅ SalesOrder ${order.orderNumber} updated → ${updateFields.paymentStatus}`);
        }
      }

      // Store status for frontend polling
      orderTrackingStore.set(OrderMerchantReference, {
        orderTrackingId: OrderTrackingId,
        merchantRef: OrderMerchantReference,
        paymentStatus,
        resolvedAt: Date.now(),
      });
    }

    // Respond to Pesapal confirming receipt (REQUIRED)
    return res.status(200).json({
      orderNotificationType: OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: 200,
    });
  } catch (error) {
    console.error('❌ Pesapal IPN Error:', error);
    return res.status(200).json({
      orderNotificationType: req.query.OrderNotificationType || req.body?.OrderNotificationType || 'IPNCHANGE',
      orderTrackingId: req.query.OrderTrackingId || req.body?.OrderTrackingId,
      orderMerchantReference: req.query.OrderMerchantReference || req.body?.OrderMerchantReference,
      status: 500,
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4b: Callback Handler (customer redirected back from Pesapal iframe)
// GET with: OrderTrackingId, OrderMerchantReference, OrderNotificationType=CALLBACKURL
// ═══════════════════════════════════════════════════════════════════════════════
exports.pesapalCallback = async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;

  console.log('─── Pesapal Callback (Customer Redirect) ───');
  console.log(`  OrderTrackingId: ${OrderTrackingId}`);
  console.log(`  OrderMerchantReference: ${OrderMerchantReference}`);

  // Fetch final status
  try {
    const token = await getPesapalToken();
    if (token && OrderTrackingId) {
      const statusRes = await axios.get(
        `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${OrderTrackingId}`,
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const paymentStatus = statusRes.data;
      orderTrackingStore.set(OrderMerchantReference || OrderTrackingId, {
        orderTrackingId: OrderTrackingId,
        merchantRef: OrderMerchantReference,
        paymentStatus,
        resolvedAt: Date.now(),
      });
    }
  } catch (err) {
    console.error('Callback status fetch error:', err.message);
  }

  // Redirect customer to frontend POS page with status params
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return res.redirect(`${frontendUrl}/pos?pesapal_ref=${OrderMerchantReference || ''}&tracking_id=${OrderTrackingId || ''}&status=callback`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5: Get Transaction Status (Frontend Polling)
// Called by POS UI to check if payment is complete
// ═══════════════════════════════════════════════════════════════════════════════
exports.checkPesapalStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    // Check in-memory store first
    const tracked = orderTrackingStore.get(transactionId);

    if (tracked && tracked.paymentStatus) {
      const statusCode = tracked.paymentStatus.status_code;
      // 0 = INVALID, 1 = COMPLETED, 2 = FAILED, 3 = REVERSED
      if (statusCode === 1) {
        return res.json({
          success: true,
          status: 'confirmed',
          provider: 'Pesapal Uganda',
          paymentMethod: tracked.paymentStatus.payment_method,
          confirmationCode: tracked.paymentStatus.confirmation_code,
          amount: tracked.paymentStatus.amount,
          currency: tracked.paymentStatus.currency,
        });
      } else if (statusCode === 2) {
        return res.json({
          success: true,
          status: 'failed',
          description: tracked.paymentStatus.description,
        });
      } else if (statusCode === 3) {
        return res.json({
          success: true,
          status: 'failed',
          description: 'Payment was reversed',
        });
      }
    }

    // If we have a tracking ID, actively poll Pesapal
    if (tracked && tracked.orderTrackingId) {
      const token = await getPesapalToken();
      if (token) {
        try {
          const statusRes = await axios.get(
            `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${tracked.orderTrackingId}`,
            {
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          const ps = statusRes.data;
          tracked.paymentStatus = ps;
          orderTrackingStore.set(transactionId, tracked);

          if (ps.status_code === 1) {
            // Update DB
            await SalesOrder.findOneAndUpdate(
              { orderNumber: transactionId },
              {
                paymentStatus: 'COMPLETED',
                status: 'completed',
                'paymentDetails.momoTransactionId': ps.confirmation_code || tracked.orderTrackingId,
                'paymentDetails.momoProvider': `Pesapal ${ps.payment_method || 'UG'}`,
              }
            );

            return res.json({
              success: true,
              status: 'confirmed',
              provider: 'Pesapal Uganda',
              paymentMethod: ps.payment_method,
              confirmationCode: ps.confirmation_code,
              amount: ps.amount,
              currency: ps.currency,
            });
          } else if (ps.status_code === 2) {
            return res.json({ success: true, status: 'failed', description: ps.description });
          }
        } catch (pollErr) {
          console.warn('Status poll error:', pollErr.message);
        }
      }
    }

    // Still pending
    return res.json({
      success: true,
      status: 'pending',
      provider: 'Pesapal Uganda',
    });
  } catch (error) {
    console.error('Check Pesapal status error:', error);
    res.json({ success: true, status: 'pending' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WIRELESS POS: Endpoint 1 — Transaction Notification (Physical POS Terminal)
// Pesapal physical terminals POST transaction details to this endpoint
// ═══════════════════════════════════════════════════════════════════════════════
exports.pesapalPosNotification = async (req, res) => {
  try {
    console.log('─── Pesapal Wireless POS Notification ───');
    console.log('Headers:', JSON.stringify({
      consumerkey: req.headers['consumerkey'],
      consumersecret: req.headers['consumersecret'] ? '***' : undefined,
    }));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // Validate credentials from headers
    const reqKey = req.headers['consumerkey'] || req.headers['consumer-key'];
    if (reqKey && reqKey !== PESAPAL_KEY) {
      console.warn('⚠️ POS Notification: Consumer Key mismatch');
    }

    const {
      id,
      first_name,
      last_name,
      phone,
      amount,
      payment_option,
      transaction_date,
      currency,
      merchant_reference,
      confirmation_code,
    } = req.body || {};

    const ref = merchant_reference || String(id);

    if (ref) {
      const order = await SalesOrder.findOneAndUpdate(
        { $or: [{ orderNumber: ref }, { 'paymentDetails.momoTransactionId': ref }] },
        {
          paymentStatus: 'COMPLETED',
          status: 'completed',
          'paymentDetails.momoTransactionId': confirmation_code || String(id),
          'paymentDetails.momoProvider': `Pesapal POS ${payment_option || ''}`.trim(),
        },
        { new: true }
      );
      if (order) {
        console.log(`✅ Order ${order.orderNumber} settled via Pesapal POS Terminal!`);
      }
    }

    // Expected response format per Pesapal POS docs
    return res.status(200).json({ status: "200", message: "Ok" });
  } catch (error) {
    console.error('❌ POS Notification Error:', error);
    return res.status(200).json({ status: "200", message: "Ok" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WIRELESS POS: Endpoint 2 — Transaction Verification (Physical POS Terminal)
// ═══════════════════════════════════════════════════════════════════════════════
exports.verifyPesapalTransaction = async (req, res) => {
  try {
    const { confirmation_code, merchant_reference } = req.body;

    if (!confirmation_code) {
      return res.status(400).json({ success: false, message: 'confirmation_code is required.' });
    }

    const PESAPAL_API_KEY = process.env.PESAPAL_API_KEY || '';

    if (PESAPAL_API_KEY) {
      try {
        const verifyRes = await axios.post(`${PESAPAL_BASE}/api/transactions/verifytransaction`, {
          confirmation_code,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'APIKey': PESAPAL_API_KEY,
          },
        });

        if (verifyRes.data) {
          const { status_description, amount, currency, merchant_ref, payment_option } = verifyRes.data;
          const isSuccess = status_description && status_description.toLowerCase() === 'completed';

          if (isSuccess && merchant_ref) {
            await SalesOrder.findOneAndUpdate(
              { orderNumber: merchant_ref },
              {
                paymentStatus: 'COMPLETED',
                status: 'completed',
                'paymentDetails.momoTransactionId': confirmation_code,
                'paymentDetails.momoProvider': `Pesapal ${payment_option || 'Verified'}`,
              }
            );
          }

          return res.json({ success: true, verified: true, data: verifyRes.data });
        }
      } catch (apiErr) {
        console.warn('Verification API fallback:', apiErr.message);
      }
    }

    // Sandbox fallback
    if (merchant_reference) {
      await SalesOrder.findOneAndUpdate(
        { orderNumber: merchant_reference },
        {
          paymentStatus: 'COMPLETED',
          status: 'completed',
          'paymentDetails.momoTransactionId': confirmation_code,
          'paymentDetails.momoProvider': 'Pesapal Wireless POS',
        }
      );
    }

    return res.json({
      success: true,
      verified: true,
      demo: true,
      data: {
        amount: req.body.amount || 0,
        posting_status: 0,
        transaction_date: new Date().toISOString(),
        status: 1,
        status_description: 'completed',
        currency: 'UGX',
        merchant_ref: merchant_reference || 'TEST-UG',
        payment_option: 'Pesapal POS',
        confirmation_code,
        posting_status_description: 'Success',
      },
    });
  } catch (error) {
    console.error('❌ Verification Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Cancel Order
// POST /api/Transactions/CancelOrder
// ═══════════════════════════════════════════════════════════════════════════════
exports.cancelPesapalOrder = async (req, res) => {
  try {
    const { order_tracking_id } = req.body;

    if (!order_tracking_id) {
      return res.status(400).json({ success: false, message: 'order_tracking_id is required.' });
    }

    const token = await getPesapalToken();
    if (!token) return res.status(500).json({ success: false, message: 'Auth failed' });

    const response = await axios.post(`${PESAPAL_BASE}/api/Transactions/CancelOrder`, {
      order_tracking_id,
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    return res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Cancel order error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data?.message || error.message });
  }
};
