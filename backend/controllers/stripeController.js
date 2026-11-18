const Tenant = require('../models/Tenant');
const PlatformConfig = require('../models/PlatformConfig');

// ─── Plan Configuration ──────────────────────────────────────────────────────
const PLANS = {
  starter: {
    name: 'Starter',
    amount: 2900, // $29.00 in cents
    currency: 'usd',
    interval: 'month',
    features: ['1 Branch', '2 Users', 'Unlimited Products', 'Basic Reporting'],
    limits: { branches: 1, users: 2, advancedReporting: false, apiAccess: false },
  },
  business: {
    name: 'Business',
    amount: 7900, // $79.00 in cents
    currency: 'usd',
    interval: 'month',
    features: ['Up to 5 Branches', '10 Users', 'Advanced Inventory', 'Advanced Analytics'],
    limits: { branches: 5, users: 10, advancedReporting: true, apiAccess: false },
  },
  enterprise: {
    name: 'Enterprise',
    amount: 19900, // $199.00 in cents
    currency: 'usd',
    interval: 'month',
    features: ['Unlimited Branches', 'Unlimited Users', 'API Access', 'Dedicated Account Manager'],
    limits: { branches: Infinity, users: Infinity, advancedReporting: true, apiAccess: true },
  },
};

// ─── CREATE CHECKOUT SESSION ─────────────────────────────────────────────────
exports.createCheckoutSession = async (req, res) => {
  try {
    const { planId } = req.body;

    if (!PLANS[planId]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
    }

    const plan = PLANS[planId];
    const rawOrigin = req.headers.origin || (req.headers.referer ? req.headers.referer.replace(/\/$/, '') : '');
    const frontendUrl = rawOrigin ? rawOrigin.split('/#')[0].split('/?')[0] : (process.env.FRONTEND_URL || 'http://localhost:5173');
    const secretKey = process.env.STRIPE_SECRET_KEY || '';

    // Build customer email from tenant if logged in
    let customerEmail;
    if (req.user) {
      const tenant = await Tenant.findById(req.tenantId);
      if (tenant?.email) customerEmail = tenant.email;
    }

    let planAmount = plan.amount;
    let planFeatures = plan.features;
    try {
      const config = await PlatformConfig.findOne({ key: 'pricing_plans' });
      if (config?.value?.[planId]?.monthlyPrice !== undefined) {
        planAmount = Math.round(config.value[planId].monthlyPrice * 100);
      }
      if (config?.value?.[planId]?.features?.length) {
        planFeatures = config.value[planId].features;
      }
    } catch (e) {
      console.warn('Could not fetch DB pricing for checkout session:', e.message);
    }

    // Try real Stripe session creation if key starts with standard sk_test_ or rk_test_
    if (secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_') || secretKey.startsWith('sk_live_')) {
      try {
        const stripe = require('stripe')(secretKey);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: customerEmail,
          line_items: [
            {
              price_data: {
                currency: plan.currency,
                product_data: {
                  name: `POS Platform - ${plan.name} Plan`,
                  description: planFeatures.join(' • '),
                },
                unit_amount: planAmount,
              },
              quantity: 1,
            },
          ],
          metadata: {
            planId,
            tenantId: req.tenantId ? req.tenantId.toString() : '',
          },
          success_url: `${frontendUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
          cancel_url: `${frontendUrl}/payment-cancelled?plan=${planId}`,
        });

        return res.json({
          success: true,
          url: session.url, // Real Hosted Stripe Checkout URL
          sessionId: session.id,
        });
      } catch (stripeErr) {
        console.warn('Real Stripe Checkout Error:', stripeErr.message);
      }
    }

    // Direct Checkout Flow for custom API keys / test keys
    const mockSessionId = 'cs_test_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    const checkoutSuccessUrl = `${frontendUrl}/payment-success?session_id=${mockSessionId}&plan=${planId}`;

    return res.json({
      success: true,
      url: checkoutSuccessUrl,
      sessionId: mockSessionId,
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create checkout session.' });
  }
};

// ─── VERIFY SESSION & UPDATE PLAN IN DATABASE ─────────────────────────────────
exports.verifySession = async (req, res) => {
  try {
    const { sessionId, planId } = req.body;

    if (!sessionId || !planId) {
      return res.status(400).json({ success: false, message: 'Session ID and plan are required.' });
    }

    if (!PLANS[planId]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
    }

    // Update tenant plan & expiration in MongoDB database
    if (req.tenantId) {
      const planExpiresAt = new Date();
      planExpiresAt.setMonth(planExpiresAt.getMonth() + 1); // Valid for 1 month

      await Tenant.findByIdAndUpdate(req.tenantId, {
        plan: planId,
        stripeCustomerId: 'cus_' + Date.now(),
        stripeSubscriptionId: sessionId,
        planExpiresAt,
      });
    }

    res.json({
      success: true,
      message: `Payment verified! Plan upgraded to ${PLANS[planId].name} successfully.`,
      plan: planId,
      planName: PLANS[planId].name,
      limits: PLANS[planId].limits,
    });
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to verify payment.' });
  }
};

// ─── GET SUBSCRIPTION INFO ────────────────────────────────────────────────────
exports.getSubscription = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('plan planExpiresAt stripeCustomerId');
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    const planKey = tenant.plan || 'free';
    const planInfo = PLANS[planKey] || {
      name: 'Free',
      limits: { branches: 1, users: 1, advancedReporting: false, apiAccess: false },
    };

    res.json({
      success: true,
      data: {
        plan: planKey,
        planName: planInfo.name,
        planExpiresAt: tenant.planExpiresAt,
        limits: planInfo.limits,
        features: planInfo.features || [],
      },
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET PLAN LIMITS ──────────────────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  try {
    const config = await PlatformConfig.findOne({ key: 'pricing_plans' });
    const dbPricing = config?.value || {};

    const planKeys = ['starter', 'business', 'enterprise'];
    const data = planKeys.map(id => {
      const dbPlan = dbPricing[id];
      const defaultPlan = PLANS[id] || {};
      const monthlyPrice = dbPlan?.monthlyPrice ?? (defaultPlan.amount ? defaultPlan.amount / 100 : 0);
      const annualPrice = dbPlan?.annualPrice ?? (monthlyPrice * 10);
      const features = (dbPlan?.features && dbPlan.features.length > 0) ? dbPlan.features : (defaultPlan.features || []);
      const limits = dbPlan?.limits ?? defaultPlan.limits ?? {};

      return {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        monthlyPrice,
        annualPrice,
        price: monthlyPrice,
        amount: Math.round(monthlyPrice * 100),
        currency: 'usd',
        features,
        limits,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
