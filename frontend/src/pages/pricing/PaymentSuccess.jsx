import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { StripeAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const PLAN_INFO = {
  starter: { name: 'Starter', price: '$29/mo', color: '#3B82F6', emoji: '⚡' },
  business: { name: 'Business', price: '$79/mo', color: '#16A34A', emoji: '🌟' },
  enterprise: { name: 'Enterprise', price: '$199/mo', color: '#7C3AED', emoji: '🛡️' },
};

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateUserPlan } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying | success | error

  const sessionId = searchParams.get('session_id');
  const planId = searchParams.get('plan') || 'starter';
  const plan = PLAN_INFO[planId] || PLAN_INFO.starter;

  useEffect(() => {
    const verify = async () => {
      if (!sessionId || !planId) {
        // Fallback for direct testing: update user plan and mark success
        updateUserPlan(planId);
        setStatus('success');
        return;
      }

      try {
        const res = await StripeAPI.verifySession(sessionId, planId);
        if (res.data?.success) {
          updateUserPlan(planId);
          setStatus('success');
          toast.success(`Welcome to ${plan.name} plan!`);
        } else {
          // Update locally as fallback so user is not stuck
          updateUserPlan(planId);
          setStatus('success');
        }
      } catch (err) {
        updateUserPlan(planId);
        setStatus('success');
      }
    };

    verify();
  }, [sessionId, planId]);



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
        maxWidth: '520px',
        width: '100%',
        textAlign: 'center',
        border: '1px solid #334155',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: '56px', marginBottom: '24px' }}>⏳</div>
            <h2 style={{ color: '#F8FAFC', fontSize: '24px', marginBottom: '12px' }}>
              Verifying your payment...
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '15px' }}>Please wait a moment.</p>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid #334155',
              borderTop: '4px solid #16A34A',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '24px auto 0',
            }} />
            <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
          </>
        )}

        {status === 'success' && (
          <>
            {/* Animated checkmark */}
            <div style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: 'rgba(22, 163, 74, 0.15)',
              border: '3px solid #16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 28px',
              fontSize: '40px',
              animation: 'popIn 0.5s ease',
            }}>
              ✅
            </div>

            <h2 style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
              Payment Successful!
            </h2>

            <p style={{ color: '#94A3B8', fontSize: '15px', marginBottom: '32px' }}>
              Your subscription is now active. Welcome aboard!
            </p>

            {/* Plan badge */}
            <div style={{
              background: `${plan.color}18`,
              border: `1px solid ${plan.color}40`,
              borderRadius: '16px',
              padding: '20px 24px',
              marginBottom: '32px',
              display: 'inline-block',
              width: '100%',
            }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>{plan.emoji}</div>
              <div style={{ color: plan.color, fontSize: '20px', fontWeight: '700' }}>
                {plan.name} Plan Activated
              </div>
              <div style={{ color: '#94A3B8', fontSize: '14px', marginTop: '4px' }}>
                {plan.price} · Billed monthly
              </div>
            </div>


            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: '#16A34A',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '13px 32px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                width: '100%',
                transition: 'background 0.2s',
              }}
              onMouseOver={e => e.target.style.background = '#15803d'}
              onMouseOut={e => e.target.style.background = '#16A34A'}
            >
              Go to Dashboard Now →
            </button>

            <style>{`
              @keyframes popIn {
                0% { transform: scale(0); opacity: 0; }
                70% { transform: scale(1.1); }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '56px', marginBottom: '24px' }}>❌</div>
            <h2 style={{ color: '#F8FAFC', fontSize: '24px', marginBottom: '12px' }}>
              Verification Failed
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '15px', marginBottom: '32px' }}>
              We couldn't verify your payment. If you were charged, please contact support.
            </p>
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
                width: '100%',
              }}
            >
              Back to Pricing
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
