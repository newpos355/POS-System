import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FiBox, FiZap, FiMapPin, FiBarChart2, FiUsers, FiShield,
  FiCheckCircle, FiChevronRight, FiPlayCircle, FiMonitor
} from 'react-icons/fi';
import { StripeAPI } from '../../services/api';
import './LandingPage.css';

const DEFAULT_LANDING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    popular: false,
    ctaText: 'Start Free Trial',
    ctaLink: '/register',
    features: [
      '1 Store Location',
      '2 POS Registers',
      'Unlimited Products',
      'Basic Reporting',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 79,
    popular: true,
    ctaText: 'Get Started',
    ctaLink: '/register',
    features: [
      'Up to 5 Store Locations',
      '10 POS Registers',
      'Advanced Inventory',
      'Employee Management',
      'Advanced Reporting',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    popular: false,
    ctaText: 'Contact Sales',
    ctaLink: '/contact',
    features: [
      'Unlimited Locations',
      'Unlimited Registers',
      'API Access',
      'Dedicated Account Manager',
      'Custom Integrations',
    ],
  },
];

const LandingPage = () => {
  const [plans, setPlans] = useState(DEFAULT_LANDING_PLANS);

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
      console.warn('Failed to load landing page pricing:', err);
    }
  };

  return (
    <div className="landing-page">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <div className="logo-icon-green"></div>
            <span>POS Platform</span>
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it Works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="nav-actions">
            <Link to="/login" className="btn-outline">Login</Link>
            <Link to="/register" className="btn-primary">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <h1>Powerful POS System For Malls, Supermarkets & Retail Chains</h1>
            <p>
              Streamline your retail operations, manage inventory across multiple locations, 
              and delight your customers with our lightning-fast point of sale software.
            </p>
            <div className="hero-cta">
              <Link to="/register" className="btn-primary btn-lg">Get Started Free</Link>
              <a href="#demo" className="btn-outline-white btn-lg">
                <FiPlayCircle className="icon-mr" /> Watch Demo
              </a>
            </div>
          </div>
          <div className="hero-illustration">
            <div className="mockup-card sales-card">
              <div className="card-header">
                <div className="dots"><span></span><span></span><span></span></div>
              </div>
              <div className="card-body">
                <div className="stat-row">
                  <div>
                    <span className="stat-label">Total Sales</span>
                    <span className="stat-value">$24,592.00</span>
                  </div>
                  <div className="stat-badge">+14.5%</div>
                </div>
                <div className="chart-placeholder">
                  <div className="bar b1"></div>
                  <div className="bar b2"></div>
                  <div className="bar b3"></div>
                  <div className="bar b4"></div>
                  <div className="bar b5"></div>
                  <div className="bar b6"></div>
                  <div className="bar b7"></div>
                </div>
              </div>
            </div>
            <div className="mockup-card floating-card">
              <div className="flex-row">
                <div className="icon-circle"><FiMonitor /></div>
                <div>
                  <div className="text-line w-full"></div>
                  <div className="text-line w-half"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUSTED BY */}
      <section className="trusted-section">
        <p>Trusted by 1000+ Businesses Worldwide</p>
        <div className="company-logos">
          <span className="logo-placeholder">TechMart</span>
          <span className="logo-placeholder">GlobalStore</span>
          <span className="logo-placeholder">RetailX</span>
          <span className="logo-placeholder">FreshFoods</span>
          <span className="logo-placeholder">MegaMall</span>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="features-section">
        <div className="section-header">
          <h2>Everything You Need To Run Your Store</h2>
          <p>Powerful features designed to help you manage and grow your retail business.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><FiBox /></div>
            <h3>Smart Inventory</h3>
            <p>Real-time stock tracking, low stock alerts, and automated purchase orders to never run out of top sellers.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FiZap /></div>
            <h3>Fast Checkout</h3>
            <p>Lightning-fast POS interface designed for speed to reduce queues and keep your customers happy.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FiMapPin /></div>
            <h3>Multi-Branch</h3>
            <p>Manage multiple stores from a single dashboard. Transfer stock between locations with ease.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FiBarChart2 /></div>
            <h3>Detailed Reports</h3>
            <p>Make data-driven decisions with comprehensive sales, profit, and inventory reports.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FiUsers /></div>
            <h3>Customer Management</h3>
            <p>Build loyalty with built-in CRM, purchase history tracking, and flexible discount systems.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FiShield /></div>
            <h3>Secure Payments</h3>
            <p>Accept multiple payment methods securely including cash, cards, and mobile money.</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="how-it-works-section">
        <div className="section-header">
          <h2>How It Works</h2>
          <p>Get up and running in minutes, not days.</p>
        </div>
        <div className="steps-container">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Create Account</h3>
            <p>Sign up and set up your business profile securely in seconds.</p>
          </div>
          <div className="step-line"></div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Add Products</h3>
            <p>Import your inventory easily via CSV or add products manually.</p>
          </div>
          <div className="step-line"></div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Start Selling</h3>
            <p>Open the POS terminal and start processing sales instantly.</p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="pricing-section">
        <div className="section-header">
          <h2>Simple, Transparent Pricing</h2>
          <p>Choose the perfect plan for your business size.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <div key={plan.id} className={`pricing-card ${plan.popular ? 'popular' : ''}`}>
              {plan.popular && <div className="popular-badge">Most Popular</div>}
              <h3>{plan.name}</h3>
              <div className="price"><span>$</span>{plan.price}<span>/mo</span></div>
              <ul className="feature-list">
                {plan.features.map((f, i) => (
                  <li key={i}><FiCheckCircle className="check-icon" /> {f}</li>
                ))}
              </ul>
              <Link to={plan.ctaLink} className={`btn-${plan.popular ? 'primary' : 'outline'} w-full`}>
                {plan.ctaText}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="cta-banner">
        <div className="cta-content">
          <h2>Ready to Transform Your Retail Business?</h2>
          <p>Join thousands of businesses already growing with our POS platform.</p>
          <Link to="/register" className="btn-primary btn-lg btn-white">
            Create Your Free Account <FiChevronRight />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-col">
            <div className="nav-logo mb-4">
              <div className="logo-icon-green"></div>
              <span className="text-white">POS Platform</span>
            </div>
            <p className="text-gray-400">
              The all-in-one POS and inventory management system designed for modern retail.
            </p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <a href="#">Features</a>
            <a href="#">Pricing</a>
            <a href="#">Hardware</a>
            <a href="#">Integrations</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
            <a href="#">Blog</a>
            <a href="#">Contact</a>
          </div>
          <div className="footer-col">
            <h4>Support</h4>
            <a href="#">Help Center</a>
            <a href="#">API Documentation</a>
            <a href="#">System Status</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 POS Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
