import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiCamera, FiBarChart2, FiSearch } from 'react-icons/fi';

/**
 * BarcodeScanner component
 * Mode 1: USB/Keyboard scanner — listens for rapid keydown sequences that end with Enter
 * Mode 2: Camera scanner — uses @zxing/browser for live camera decode
 * 
 * Props:
 *   onScan(code) — called when a barcode is scanned
 *   onClose()    — called to close the scanner modal
 *   cameraMode   — boolean, open camera mode by default
 */

const BarcodeScanner = ({ onScan, onClose, cameraMode = false }) => {
  const [mode, setMode] = useState(cameraMode ? 'camera' : 'usb');
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);

  // ── USB/Keyboard scanner listener ────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'usb') return;
    let buffer = '';
    let lastTime = 0;

    const handleKeyDown = (e) => {
      const now = Date.now();
      // USB barcode scanners type characters very rapidly (< 30ms apart)
      if (now - lastTime > 500) buffer = '';
      lastTime = now;

      if (e.key === 'Enter' && buffer.length > 3) {
        onScan(buffer.trim());
        buffer = '';
        e.preventDefault();
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, onScan]);

  // ── Camera scanner using @zxing/browser ─────────────────────────────────────
  useEffect(() => {
    if (mode !== 'camera') return;
    let stopped = false;

    const startCamera = async () => {
      setScanning(true);
      setCameraError('');
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices.length === 0) {
          setCameraError('No camera found on this device.');
          return;
        }

        const deviceId = devices[devices.length - 1]?.deviceId;
        await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
          if (stopped) return;
          if (result) {
            onScan(result.getText());
            stopped = true;
            reader.reset();
            onClose();
          }
        });
      } catch (err) {
        setCameraError('Camera access denied or not supported. Use USB scanner instead.');
      } finally {
        setScanning(false);
      }
    };

    startCamera();

    return () => {
      stopped = true;
      if (codeReaderRef.current) {
        try { codeReaderRef.current.reset(); } catch {}
      }
    };
  }, [mode, onScan, onClose]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <FiBarChart2 />
            </div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Barcode Scanner</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '18px' }}><FiX /></button>
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--background, #f8fafc)', borderRadius: '10px', padding: '4px' }}>
          {[{ id: 'usb', label: '🔌 USB Scanner', desc: 'Physical barcode gun' }, { id: 'camera', label: '📷 Camera', desc: 'Scan with device camera' }, { id: 'manual', label: '⌨️ Manual', desc: 'Type the code' }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: mode === m.id ? 'white' : 'transparent', boxShadow: mode === m.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', fontSize: '12px', fontWeight: 600, color: mode === m.id ? '#16A34A' : '#64748B', transition: 'all 0.15s' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* USB Mode */}
        {mode === 'usb' && (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔌</div>
            <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>USB Scanner Ready</h3>
            <p style={{ color: '#64748B', fontSize: '14px' }}>
              Point your USB barcode scanner at any product barcode and press the trigger. The code will be detected automatically.
            </p>
            <div style={{ marginTop: '16px', padding: '12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0', fontSize: '13px', color: '#15803D' }}>
               Scanner is listening for barcodes...
            </div>
          </div>
        )}

        {/* Camera Mode */}
        {mode === 'camera' && (
          <div>
            {cameraError ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#DC2626', background: '#FEF2F2', borderRadius: '8px' }}>
                <p>{cameraError}</p>
              </div>
            ) : (
              <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
                <video ref={videoRef} style={{ width: '100%', display: 'block' }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '60%', height: '40%', border: '2px solid #16A34A', borderRadius: '8px', boxShadow: '0 0 0 2000px rgba(0,0,0,0.4)' }} />
                <p style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, textAlign: 'center', color: 'white', fontSize: '13px' }}>
                  {scanning ? 'Starting camera...' : 'Align barcode within the green box'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Manual Mode */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '6px' }}>Enter Barcode / SKU</label>
              <div style={{ position: 'relative' }}>
                <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="Scan or type barcode..."
                  autoFocus
                  style={{ width: '100%', padding: '11px 12px 11px 36px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'monospace', background: 'var(--background, #f8fafc)', color: 'var(--text, #0f172a)' }}
                />
              </div>
            </div>
            <button type="submit" disabled={!manualCode.trim()} style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white', border: 'none', borderRadius: '8px', cursor: manualCode.trim() ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 700 }}>
              Search Product
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default BarcodeScanner;
