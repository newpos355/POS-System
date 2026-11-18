import React, { useState, useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
// Reuse the shared, env-configured API client instead of a private instance
// hardcoded to http://localhost:5000 — that hardcoding meant mobile money
// payments failed outright in every deployed (non-local) environment, and it
// read the auth token only from localStorage, inconsistent with the
// sessionStorage-first session model used everywhere else (see AuthContext).
import API from '../../services/api';

export default function MobileMoneyModal({ provider = 'pesapal', amount, currency = 'UGX', orderRef, onSuccess, onClose }) {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | iframe | confirmed | failed
  const [transactionId, setTransactionId] = useState(null);
  const [pesapalIframeUrl, setPesapalIframeUrl] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleInitiate = async () => {
    if (!phone || phone.length < 7) {
      setErrorMsg('Please enter a valid phone number.');
      return;
    }
    setErrorMsg('');
    setStatus('sending');

    try {
      const res = await API.post('/pesapal/initiate', {
        phone: `256${phone.replace(/^0/, '')}`,
        amount: Number(amount),
        currency: 'UGX',
        reference: orderRef,
      });

      if (res.data?.success) {
        const txId = res.data.transactionId;
        setTransactionId(txId);

        if (res.data.redirectUrl) {
          setPesapalIframeUrl(res.data.redirectUrl);
          setStatus('iframe');
          startPolling(txId);
        } else {
          setStatus('failed');
          setErrorMsg('No payment URL received from Pesapal.');
        }
      } else {
        setStatus('failed');
        setErrorMsg(res.data?.message || 'Payment initiation failed.');
      }
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err.response?.data?.message || 'Network error. Please try again.');
    }
  };

  const startPolling = (txId) => {
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      if (count > 20) {
        clearInterval(pollRef.current);
        setStatus('failed');
        setErrorMsg('Payment timed out. Please try again.');
        return;
      }
      try {
        const res = await API.get(`/pesapal/status/${txId}`);
        if (res.data?.status === 'confirmed') {
          clearInterval(pollRef.current);
          setStatus('confirmed');
          setTimeout(() => onSuccess('Pesapal Uganda', { txId, phone }), 1200);
        } else if (res.data?.status === 'failed') {
          clearInterval(pollRef.current);
          setStatus('failed');
          setErrorMsg('Payment was declined. Please try again.');
        }
      } catch (_) {}
    }, 3000);
  };

  const handleReset = () => {
    clearInterval(pollRef.current);
    setStatus('idle');
    setTransactionId(null);
    setPesapalIframeUrl(null);
    setErrorMsg('');
    setPollCount(0);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        width: '100%',
        maxWidth: status === 'iframe' ? '520px' : '420px',
        maxHeight: '92vh',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          background: '#F0FDF4',
          borderBottom: '2px solid #16A34A',
          padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803D' }}>
              🇺🇬 Pesapal Uganda
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Airtel Money · MTN MoMo · Visa · Mastercard
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '20px', color: '#64748B', padding: '4px',
          }}>
            <FiX />
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* Amount */}
          <div style={{
            background: '#F8FAFC', borderRadius: '12px',
            padding: '14px', textAlign: 'center', marginBottom: '18px',
            border: '1px solid #E2E8F0',
          }}>
            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>Amount to Collect</div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: '#0F172A' }}>
              UGX {Number(amount).toLocaleString()}
            </div>
          </div>

          {/* ── IDLE: Enter phone ── */}
          {status === 'idle' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                  Customer Phone Number (Uganda)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{
                    background: '#F1F5F9', border: '1.5px solid #E2E8F0',
                    borderRadius: '10px', padding: '10px 12px',
                    fontSize: '13px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                  }}>
                    🇺🇬 +256
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="771 234 567"
                    style={{
                      flex: 1, padding: '10px 14px',
                      border: '1.5px solid #E2E8F0', borderRadius: '10px',
                      fontSize: '14px', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#16A34A'}
                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                    autoFocus
                  />
                </div>
                {errorMsg && <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px' }}>{errorMsg}</div>}
              </div>

              <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#1D4ED8' }}>
                💳 Pesapal will open a secure checkout where customer can pay via <strong>Airtel Money, MTN MoMo, Visa or Mastercard</strong>.
              </div>

              <button
                onClick={handleInitiate}
                style={{
                  width: '100%', padding: '14px',
                  background: '#16A34A', color: 'white',
                  border: 'none', borderRadius: '12px',
                  fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                🇺🇬 Open Pesapal Checkout
              </button>
            </>
          )}

          {/* ── SENDING ── */}
          {status === 'sending' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: '#0F172A' }}>Creating Payment Order...</div>
              <div style={{ color: '#64748B', fontSize: '13px', marginTop: '6px' }}>Contacting Pesapal Uganda API</div>
              <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
            </div>
          )}

          {/* ── IFRAME ── */}
          {status === 'iframe' && pesapalIframeUrl && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Status bar */}
              <div style={{
                background: '#F0FDF4', borderRadius: '8px', padding: '8px 12px',
                marginBottom: '10px', fontSize: '12px', color: '#15803D',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>🔒 Pesapal Secure Checkout</span>
                <a
                  href={pesapalIframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: '#16A34A', color: '#fff', textDecoration: 'none',
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                  }}
                >
                  Open in New Tab ↗
                </a>
              </div>

              {/* Iframe */}
              <iframe
                src={pesapalIframeUrl}
                title="Pesapal Payment"
                style={{
                  width: '100%', height: '360px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px', backgroundColor: '#FAFAFA',
                }}
                allow="payment"
              />

              {/* Bottom controls */}
              <div style={{
                marginTop: '10px', background: '#F8FAFC',
                border: '1px solid #E2E8F0', borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  ⏱️ Checking payment... ({Math.max(0, 60 - pollCount * 3)}s)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      clearInterval(pollRef.current);
                      setStatus('confirmed');
                      setTimeout(() => onSuccess('Pesapal Uganda', { txId: transactionId, phone }), 800);
                    }}
                    style={{
                      background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '6px',
                      padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#166534',
                    }}
                  >
                    ⚡ Sandbox: Mark Paid
                  </button>
                  <button
                    onClick={handleReset}
                    style={{
                      background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px',
                      padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#64748B',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── CONFIRMED ── */}
          {status === 'confirmed' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '64px', marginBottom: '12px' }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: '20px', color: '#16A34A' }}>Payment Confirmed!</div>
              <div style={{ color: '#64748B', fontSize: '13px', marginTop: '8px' }}>
                Pesapal Uganda payment received successfully
              </div>
              {transactionId && (
                <div style={{
                  background: '#F0FDF4', borderRadius: '8px', padding: '10px',
                  marginTop: '14px', fontSize: '11px', color: '#15803D', fontFamily: 'monospace',
                }}>
                  Ref: {transactionId}
                </div>
              )}
            </div>
          )}

          {/* ── FAILED ── */}
          {status === 'failed' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '56px', marginBottom: '12px' }}>❌</div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: '#EF4444' }}>Payment Failed</div>
              <div style={{ color: '#64748B', fontSize: '13px', margin: '8px 0 20px' }}>{errorMsg}</div>
              <button onClick={handleReset} style={{
                background: '#EF4444', color: 'white', border: 'none',
                borderRadius: '10px', padding: '12px 28px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}>
                Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
