import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiCheck, FiArrowLeft, FiZap, FiStar, FiShield, FiLoader } from 'react-icons/fi';
import { StripeAPI } from '../../services/api';
import toast from 'react-hot-toast';
import './pricing.css';

const DEFAULT_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    desc: 'Perfect for small single-store businesses.',
    badge: null,
    icon: <FiZap />,
    color: '#3B82F6',
    features: [
      '1 Branch / Store Location',
      'Up to 2 Users',
      'Unlimited Products',
      'Basic Reporting & Analytics',
      'POS Terminal Access',
      'Customer Management',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 79,
    desc: 'For growing businesses with multiple locations.',
    badge: 'Most Popular',
    icon: <FiStar />,
    color: '#16A34A',
    features: [
      'Up to 5 Branch Locations',
      'Up to 10 Users',
      'Advanced Inventory Management',
      'Advanced Analytics & Reports',
      'Employee Management',
      'Email Support',
      'Priority Processing',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    desc: 'Full features for large retail operations.',
    badge: null,
    icon: <FiShield />,
    color: '#7C3AED',
    features: [
      'Unlimited Branch Locations',
      'Unlimited Users & Roles',
      'Full API Access',
      'Custom Integrations',
      'Dedicated Account Manager',
      '24/7 Priority Phone Support',
      'White-label Options',
    ],
  },
];

const Pricing = () => {
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await StripeAPI.getPlans();
      if (res.data?.success && Array.isArray(res.data.data)) {
        const fetched = res.data.data;
        setPlans(prev => prev.map(p => {
          const item = fetched.find(f => f.id === p.id);
          if (!item) return p;
          return {
            ...p,
            name: item.name || p.name,
            price: item.price ?? item.monthlyPrice ?? p.price,
            features: item.features && item.features.length > 0 ? item.features : p.features,
          };
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch dynamic pricing:', err);
    }
  };

  const handleSubscribe = async (planId) => {
    if (loadingPlan) return;

    setLoadingPlan(planId);
    try {
      const res = await StripeAPI.createCheckoutSession(planId);
      if (res.data?.success && res.data?.url) {
        // Redirect to Stripe hosted checkout page
        window.location.href = res.data.url;
      } else {
        toast.error('Could not create checkout session. Please try again.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to initiate payment. Please try again.';
      toast.error(msg);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <Link to="/" className="back-link"><FiArrowLeft /> Back to Home</Link>
        <div className="header-content">
          <h1>Simple, Transparent Pricing</h1>
          <p>Choose the perfect plan for your business. Cancel anytime. Upgrade or downgrade at any time.</p>
          <div className="trust-badges">
            <span>🔒 Secured</span>
            <span>✓ 30-day money back guarantee</span>
            <span>✓ No hidden fees</span>
          </div>
        </div>
      </header>

      <div className="pricing-cards-container">
        {plans.map((plan) => (
          <div key={plan.id} className={`pricing-card ${plan.badge ? 'popular' : ''}`}>
            {plan.badge && <div className="popular-badge">{plan.badge}</div>}

            <div className="plan-icon" style={{ color: plan.color }}>
              {plan.icon}
            </div>

            <h3>{plan.name}</h3>
            <div className="price">
              <span className="currency">$</span>
              {plan.price}
              <span className="period">/mo</span>
            </div>
            <p className="plan-desc">{plan.desc}</p>

            <ul className="features-list">
              {plan.features.map((f, i) => (
                <li key={i}>
                  <FiCheck className="check-icon" style={{ color: plan.color }} />
                  {f}
                </li>
              ))}
            </ul>

            <button
              className={`btn ${plan.badge ? 'btn-primary' : 'btn-secondary'} full-width pricing-btn`}
              onClick={() => handleSubscribe(plan.id)}
              disabled={loadingPlan !== null}
              id={`subscribe-${plan.id}`}
            >
              {loadingPlan === plan.id ? (
                <>
                  <FiLoader className="spin-icon" />
                  Redirecting to Checkout...
                </>
              ) : (
                <>Get Started — ${plan.price}/mo</>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="pricing-footer">
        {/* <p>🔒 All payments are securely processed by <strong>Stripe</strong>. We never store your card details.</p> */}
        <p style={{ marginTop: '8px', fontSize: '13px', color: '#94A3B8' }}>
          Already have an account? <Link to="/login" style={{ color: '#16A34A' }}>Log in</Link>
        </p>
      </div>
    </div>
  );
};

export default Pricing;
