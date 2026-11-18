import React, { useState } from 'react';
import { FiX, FiCreditCard, FiShield } from 'react-icons/fi';
import { formatCurrency } from '../../utils/currency';

const CARD_NETWORKS = [
  { name: 'Visa', color: '#1A1F71', text: 'VISA' },
  { name: 'Mastercard', color: '#EB001B', text: '●●' },
  { name: 'Airtel Visa', color: '#FF0000', text: '✈ Airtel' },
  { name: 'MTN Visa', color: '#FFC107', text: '🟡 MTN' },
  { name: 'UnionPay', color: '#CC0000', text: 'UP' },
];

const UGANDA_BANKS = [
  'Stanbic Bank', 'DFCU Bank', 'Centenary Bank', 'Equity Bank',
  'Absa Bank', 'NC Bank', 'PostBank', 'Housing Finance',
];

export default function CardPaymentModal({ total, orderNumber, cashierName, onConfirm, onClose }) {
  const [step, setStep] = useState('waiting'); // waiting | verify | processing | approved | declined
  const [selectedNetwork, setSelectedNetwork] = useState('Visa');
  const [authCode, setAuthCode] = useState('');
  const [last4, setLast4] = useState('');
  const [verifyError, setVerifyError] = useState('');

  const handleTerminalApproved = () => {
    // Move to verification step — cashier must enter auth code + last 4
    setStep('verify');
  };

  const handleVerifyAndConfirm = () => {
    // Validate mandatory fields
    if (!authCode || authCode.length < 4) {
      setVerifyError('Enter the Authorization Code from the card machine slip (minimum 4 characters).');
      return;
    }
    if (!last4 || last4.length !== 4) {
      setVerifyError('Enter exactly the last 4 digits of the customer\'s card.');
      return;
    }
    setVerifyError('');
    setStep('processing');

    setTimeout(() => {
      setStep('approved');
      // Auto-confirm after short delay
      setTimeout(() => {
        onConfirm('Card', {
          cardAuthCode: authCode.toUpperCase(),
          cardLast4: last4,
          cardNetwork: selectedNetwork,
        });
      }, 1200);
    }, 1500);
  };

  const handleDeclined = () => {
    setStep('declined');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.72)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px',
        width: '100%', maxWidth: '480px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1A1F71, #2563EB)',
          padding: '18px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FiCreditCard /> Card Payment
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>
              Visa • Mastercard • Airtel Visa • MTN Visa • UnionPay
            </div>
          </div>
          {(step === 'waiting' || step === 'verify') && (
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', padding: '8px', borderRadius: '8px', fontSize: '18px' }}>
              <FiX />
            </button>
          )}
        </div>

        <div style={{ padding: '22px' }}>

          {/* Amount */}
          <div style={{
            background: 'linear-gradient(135deg, #F0F4FF, #EFF6FF)',
            borderRadius: '14px', padding: '16px', textAlign: 'center',
            marginBottom: '18px', border: '1.5px solid #BFDBFE',
          }}>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Amount to Charge
            </div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#1A1F71', letterSpacing: '-0.5px', marginTop: '4px' }}>
              {formatCurrency(total)}
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Order #{orderNumber}
            </div>
          </div>

          {/* ─── STEP: Waiting for card swipe ─── */}
          {step === 'waiting' && (
            <>
              {/* Card Networks */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Card Type
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
                  {CARD_NETWORKS.map(net => (
                    <button
                      key={net.name}
                      onClick={() => setSelectedNetwork(net.name)}
                      style={{
                        border: `2px solid ${selectedNetwork === net.name ? net.color : '#E2E8F0'}`,
                        borderRadius: '8px', padding: '7px 4px',
                        background: selectedNetwork === net.name ? '#F0F4FF' : '#fff',
                        cursor: 'pointer', textAlign: 'center',
                        fontSize: '10px', fontWeight: 700, color: net.color, transition: 'all 0.15s',
                      }}
                    >
                      {net.text}
                      <div style={{ fontSize: '8px', color: '#94A3B8', marginTop: '1px', fontWeight: 400 }}>{net.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {[
                  { n: 1, icon: '💳', txt: 'Ask customer to tap / swipe / insert card', sub: 'Use your bank-provided card terminal' },
                  { n: 2, icon: '🔐', txt: 'Customer enters PIN on terminal', sub: 'Required for amounts over UGX 100,000' },
                  { n: 3, icon: '🧾', txt: 'Terminal prints "APPROVED" slip', sub: 'You will need the Auth Code and last 4 digits' },
                ].map(s => (
                  <div key={s.n} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', background: '#F8FAFC',
                    borderRadius: '8px', border: '1px solid #E2E8F0',
                  }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#1A1F71', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>{s.n}</div>
                    <div style={{ fontSize: '18px' }}>{s.icon}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '12px', color: '#0F172A' }}>{s.txt}</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Banks */}
              <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '6px' }}>Supported Ugandan Banks</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                  {UGANDA_BANKS.map(b => (
                    <span key={b} style={{ fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '12px', background: '#F1F5F9', color: '#475569' }}>{b}</span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                <button onClick={handleDeclined} style={{
                  padding: '13px', border: '1.5px solid #FCA5A5', borderRadius: '12px',
                  background: '#FEF2F2', color: '#DC2626', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                }}>✕ Declined</button>
                <button onClick={handleTerminalApproved} style={{
                  padding: '13px', border: 'none', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #16A34A, #22c55e)',
                  color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22,163,74,0.4)',
                }}>Terminal Shows APPROVED →</button>
              </div>
            </>
          )}

          {/* ─── STEP: Verify — Auth Code + Last 4 ─── */}
          {step === 'verify' && (
            <>
              <div style={{
                background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '12px',
                padding: '14px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start',
              }}>
                <FiShield style={{ fontSize: '20px', color: '#EA580C', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#9A3412' }}>Security Verification</div>
                  <div style={{ fontSize: '11px', color: '#C2410C', marginTop: '2px' }}>
                    Enter the Auth Code and last 4 digits from the card terminal slip. This prevents fraud and ensures audit records match bank statements.
                  </div>
                </div>
              </div>

              {/* Auth Code Input */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>
                  Authorization Code <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={authCode}
                  onChange={e => setAuthCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  placeholder="e.g. AUTH123456"
                  maxLength={12}
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 14px',
                    border: '1.5px solid #E2E8F0', borderRadius: '10px',
                    fontSize: '16px', fontFamily: 'monospace', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '1px',
                    outline: 'none', textAlign: 'center',
                  }}
                  onFocus={e => e.target.style.borderColor = '#2563EB'}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                />
                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>Found on the printed slip from the card terminal</div>
              </div>

              {/* Last 4 Digits */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '5px' }}>
                  Last 4 Digits of Card <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '20px', color: '#94A3B8', fontFamily: 'monospace' }}>**** **** ****</span>
                  <input
                    type="text"
                    value={last4}
                    onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    maxLength={4}
                    style={{
                      width: '80px', padding: '10px',
                      border: '1.5px solid #E2E8F0', borderRadius: '8px',
                      fontSize: '20px', fontFamily: 'monospace', fontWeight: 700,
                      textAlign: 'center', outline: 'none', letterSpacing: '3px',
                    }}
                    onFocus={e => e.target.style.borderColor = '#2563EB'}
                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                  />
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', textAlign: 'center' }}>Last 4 digits visible on card or terminal slip</div>
              </div>

              {/* Selected Network */}
              <div style={{ textAlign: 'center', marginBottom: '14px', fontSize: '12px', color: '#64748B' }}>
                Card Network: <strong style={{ color: '#0F172A' }}>{selectedNetwork}</strong>
              </div>

              {verifyError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '12px', color: '#DC2626', textAlign: 'center' }}>
                  {verifyError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                <button onClick={() => setStep('waiting')} style={{
                  padding: '13px', border: '1.5px solid #E2E8F0', borderRadius: '12px',
                  background: '#F8FAFC', color: '#475569', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                }}>← Back</button>
                <button onClick={handleVerifyAndConfirm} style={{
                  padding: '13px', border: 'none', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #1A1F71, #2563EB)',
                  color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
                }}>✓ Confirm Sale</button>
              </div>
            </>
          )}

          {/* ─── STEP: Processing ─── */}
          {step === 'processing' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⚙️</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>Processing Payment...</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '6px' }}>Saving sale & preparing receipt</div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ─── STEP: Approved ─── */}
          {step === 'approved' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: '#DCFCE7', border: '3px solid #16A34A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '32px', margin: '0 auto 14px', animation: 'popIn 0.4s ease',
              }}>✅</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A' }}>APPROVED</div>
              <div style={{ fontSize: '13px', color: '#0F172A', marginTop: '8px', fontFamily: 'monospace' }}>
                Auth: <strong>{authCode.toUpperCase()}</strong> • Card: ****{last4} • {selectedNetwork}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>🖨️ Printing receipt...</div>
              <style>{`@keyframes popIn { 0% { transform: scale(0); } 70% { transform: scale(1.1); } 100% { transform: scale(1); } }`}</style>
            </div>
          )}

          {/* ─── STEP: Declined ─── */}
          {step === 'declined' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>❌</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#DC2626' }}>DECLINED</div>
              <div style={{ fontSize: '13px', color: '#64748B', margin: '8px 0 18px' }}>
                Card was declined. Ask customer to try a different card or payment method.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button onClick={() => setStep('waiting')} style={{ padding: '12px', background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: '10px', color: '#1D4ED8', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
                  Try Again
                </button>
                <button onClick={onClose} style={{ padding: '12px', background: '#F1F5F9', border: '1.5px solid #E2E8F0', borderRadius: '10px', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
