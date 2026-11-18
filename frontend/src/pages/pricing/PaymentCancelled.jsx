import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PLAN_INFO = {
  starter: { name: 'Starter', price: '$29/mo' },
  business: { name: 'Business', price: '$79/mo' },
  enterprise: { name: 'Enterprise', price: '$199/mo' },
};

const PaymentCancelled = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const planId = searchParams.get('plan');
  const plan = PLAN_INFO[planId] || null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: '#1E293B',
        borderRadius: '24px',
        padding: '56px 48px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        border: '1px solid #334155',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          background: 'rgba(234, 179, 8, 0.12)',
          border: '3px solid #EAB308',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 28px',
          fontSize: '40px',
        }}>
          🚫
        </div>

        <h2 style={{ color: '#F8FAFC', fontSize: '26px', fontWeight: '700', marginBottom: '12px' }}>
          Payment Cancelled
        </h2>

        <p style={{ color: '#94A3B8', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
          Your payment was cancelled and you have <strong style={{ color: '#F8FAFC' }}>not been charged</strong>.
          {plan && (
            <> The <strong style={{ color: '#F8FAFC' }}>{plan.name}</strong> plan ({plan.price}) subscription was not activated.</>
          )}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => navigate('/pricing')}
            style={{
              background: '#16A34A',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '13px 32px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseOver={e => e.target.style.background = '#15803d'}
            onMouseOut={e => e.target.style.background = '#16A34A'}
          >
            Try Again — View Plans
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              background: 'transparent',
              color: '#94A3B8',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '13px 32px',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>

        <p style={{ color: '#475569', fontSize: '13px', marginTop: '24px' }}>
          Need help? Contact us at <span style={{ color: '#16A34A' }}>support@posplatform.com</span>
        </p>
      </div>
    </div>
  );
};

export default PaymentCancelled;
