import React, { useState, useEffect, useRef } from 'react';
import { FiBarChart2, FiDownload, FiPrinter, FiSearch, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ProductsAPI } from '../../services/api';

const BarcodeManager = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [labelsPerRow, setLabelsPerRow] = useState(3);
  const [barcodeType, setBarcodeType] = useState('CODE128');

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await ProductsAPI.getProducts({ limit: 500 });
      if (res.data?.data) setProducts(res.data.data);
    } catch { toast.error('Failed to load products'); }
    finally { setLoading(false); }
  };

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const selectAll = () => setSelected(filtered.map(p => p._id || p.id));
  const clearAll = () => setSelected([]);

  const downloadBarcode = async (sku, name) => {
    try {
      const JsBarcode = (await import('jsbarcode')).default;
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, sku || 'NO-SKU', { format: barcodeType, width: 2, height: 60, displayValue: true, fontSize: 14, margin: 10 });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `barcode-${name || sku}.png`;
      a.click();
      toast.success('Barcode downloaded!');
    } catch (err) { toast.error('Failed to generate barcode'); }
  };

  const printSelectedLabels = async () => {
    if (!selected.length) return toast.error('Select at least one product');
    const selectedProds = products.filter(p => selected.includes(p._id || p.id));
    try {
      const JsBarcode = (await import('jsbarcode')).default;
      const win = window.open('', '_blank');
      win.document.write(`
        <html><head><title>Barcode Labels</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 10px; }
          .grid { display: grid; grid-template-columns: repeat(${labelsPerRow}, 1fr); gap: 8px; }
          .label { border: 1px solid #ccc; padding: 8px; text-align: center; border-radius: 4px; page-break-inside: avoid; }
          .label-name { font-size: 11px; font-weight: 700; margin-bottom: 4px; word-break: break-word; }
          .label-price { font-size: 13px; color: #16A34A; font-weight: 700; }
          canvas, img { max-width: 100%; height: auto; }
          @media print { button { display: none; } }
        </style></head><body>
        <button onclick="window.print()" style="margin-bottom:10px;padding:8px 16px;background:#16A34A;color:white;border:none;border-radius:6px;cursor:pointer;">Print Labels</button>
        <div class="grid" id="grid"></div>
        <script>
          const prods = ${JSON.stringify(selectedProds.map(p => ({ name: p.name, sku: p.sku || 'NO-SKU', price: p.price })))};
          // Labels rendered via postMessage from parent
        </script>
        </body></html>
      `);

      // Render each barcode canvas
      const grid = win.document.getElementById('grid');
      for (const prod of selectedProds) {
        const div = win.document.createElement('div');
        div.className = 'label';
        const canvas = win.document.createElement('canvas');
        try {
          JsBarcode(canvas, prod.sku || 'NO-SKU', { format: barcodeType, width: 1.5, height: 50, displayValue: true, fontSize: 12, margin: 6 });
        } catch {}
        const nameEl = win.document.createElement('div');
        nameEl.className = 'label-name';
        nameEl.textContent = prod.name;
        const priceEl = win.document.createElement('div');
        priceEl.className = 'label-price';
        priceEl.textContent = `UGX ${Number(prod.price || 0).toLocaleString()}`;
        div.appendChild(nameEl);
        div.appendChild(canvas);
        div.appendChild(priceEl);
        grid.appendChild(div);
      }
      win.document.close();
      toast.success(`${selectedProds.length} labels ready to print!`);
    } catch (err) { toast.error('Print failed: ' + err.message); }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Barcode Manager</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Generate and print barcode labels for your products</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select value={barcodeType} onChange={e => setBarcodeType(e.target.value)} style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}>
            <option value="CODE128">CODE128</option>
            <option value="EAN13">EAN-13</option>
            <option value="CODE39">CODE39</option>
          </select>
          <select value={labelsPerRow} onChange={e => setLabelsPerRow(Number(e.target.value))} style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}>
            <option value={2}>2 per row</option>
            <option value={3}>3 per row</option>
            <option value={4}>4 per row</option>
          </select>
          <button className="btn btn-primary" onClick={printSelectedLabels} disabled={!selected.length}>
            <FiPrinter /> Print {selected.length > 0 ? `(${selected.length})` : ''} Labels
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input type="text" placeholder="Search by name or SKU..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>
        <button className="btn btn-outline btn-sm" onClick={selectAll}>Select All</button>
        <button className="btn btn-outline btn-sm" onClick={clearAll}>Clear</button>
        <span style={{ color: '#64748B', fontSize: '13px' }}>{selected.length} selected</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>Loading products...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
          {filtered.map(prod => {
            const id = prod._id || prod.id;
            const isSelected = selected.includes(id);
            return (
              <div key={id} onClick={() => toggleSelect(id)} style={{ border: `2px solid ${isSelected ? '#16A34A' : 'var(--border)'}`, borderRadius: '12px', padding: '16px', background: isSelected ? '#F0FDF4' : 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s', position: 'relative' }}>
                {isSelected && <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>✓</div>}
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' }}>{prod.name}</div>
                  <code style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>{prod.sku || 'NO-SKU'}</code>
                </div>
                <BarcodePreview sku={prod.sku || 'NO-SKU'} type={barcodeType} />
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#16A34A' }}>UGX {Number(prod.price || 0).toLocaleString()}</span>
                  <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); downloadBarcode(prod.sku || 'NO-SKU', prod.name); }} style={{ fontSize: '11px', padding: '4px 8px' }}>
                    <FiDownload /> PNG
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const BarcodePreview = ({ sku, type }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    import('jsbarcode').then(m => {
      try { m.default(canvasRef.current, sku, { format: type, width: 1.5, height: 40, displayValue: false, margin: 4 }); }
      catch {}
    });
  }, [sku, type]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: '44px' }} />;
};

export default BarcodeManager;
