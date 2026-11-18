import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiSave, FiX, FiRefreshCw, FiUploadCloud, FiImage, FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { ProductsAPI, CategoriesAPI, VendorsAPI, TaxRatesAPI } from '../../services/api';
import CustomFieldsSection from '../../components/CustomFieldsSection';
import './products.css';

const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    price: '',
    costPrice: '',
    taxRate: '0',
    // '' = tenant default rate, 'custom' = manual %, otherwise a TaxRate id.
    taxRateId: '',
    unit: 'pcs',
    stock: '0',
    image: '',
    expiryDate: '',
    expiryAlertDays: '30',
    preferredVendorId: '',
    allowBackorder: false,
    isDropship: false,
    trackingType: 'none',
    isComposite: false,
    soldByWeight: false,
  });
  const [vendors, setVendors] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});
  // Composite (bundle) recipe: [{productId, name, quantity}]
  const [components, setComponents] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [componentPickerId, setComponentPickerId] = useState('');

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  const [attributes, setAttributes] = useState({
    size: '',
    color: '',
    imei: '',
    serialNumber: '',
    weight: '',
    warranty: '',
    brand: '',
  });
  const [showCustomAttr, setShowCustomAttr] = useState(false);

  const getCategoryType = () => {
    if (!formData.category) return 'general';
    const cat = categories.find(c => (c._id || c.id) === formData.category || c.name === formData.category);
    const name = (cat ? cat.name : (formData.category || '')).toLowerCase();
    
    if (name.includes('cloth') || name.includes('apparel') || name.includes('fashion') || name.includes('shoe') || name.includes('wear') || name.includes('shirt') || name.includes('pant') || name.includes('dress') || name.includes('garment')) {
      return 'clothing';
    }
    if (name.includes('electronic') || name.includes('mobile') || name.includes('phone') || name.includes('tech') || name.includes('laptop') || name.includes('gadget') || name.includes('device') || name.includes('computer') || name.includes('appliance') || name.includes('tv') || name.includes('camera')) {
      return 'electronics';
    }
    return 'general';
  };

  const handleAttrChange = (e) => {
    const { name, value } = e.target;
    setAttributes(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return toast.error('Please enter a category name');
    try {
      setCreatingCategory(true);
      const res = await CategoriesAPI.createCategory({ name: newCategoryName.trim() });
      if (res.data?.success) {
        const newCat = res.data.data;
        setCategories(prev => [...prev, newCat]);
        setFormData(prev => ({ ...prev, category: newCat._id || newCat.id }));
        toast.success(`Category "${newCat.name}" created successfully!`);
        setNewCategoryName('');
        setShowAddCategory(false);
      }
    } catch (error) {
      console.error('Create category error:', error);
      toast.error(error.response?.data?.message || 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    VendorsAPI.getVendors()
      .then(res => { if (res.data?.success) setVendors(res.data.data || []); })
      .catch(() => {});
    ProductsAPI.getProducts({ limit: 200 })
      .then(res => { if (res.data?.data) setAllProducts(res.data.data); })
      .catch(() => {});
    TaxRatesAPI.getTaxRates()
      .then(res => { if (res.data?.success) setTaxRates((res.data.data || []).filter(t => t.isActive)); })
      .catch(() => {});
    if (isEditing) {
      fetchProduct();
    }
  }, [id]);

  const fetchCategories = async () => {
    try {
      const res = await CategoriesAPI.getCategories();
      if (res.data?.success && Array.isArray(res.data.data)) {
        setCategories(res.data.data);
      }
    } catch (error) {
      console.error('Fetch categories error:', error);
      toast.error('Failed to load categories');
    }
  };

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const res = await ProductsAPI.getProduct(id);
      if (res.data?.success) {
        const prod = res.data.data;
        setFormData({
          name: prod.name || '',
          sku: prod.sku || '',
          description: prod.description || '',
          category: prod.categoryId?._id || prod.categoryId || prod.category || '',
          price: prod.price || '',
          costPrice: prod.costPrice || '',
          taxRate: prod.taxRate || '0',
          taxRateId: prod.taxRateId
            ? String(prod.taxRateId?._id || prod.taxRateId)
            : (Number(prod.taxRate) > 0 ? 'custom' : ''),
          unit: prod.unit || 'pcs',
          stock: prod.stock || '0',
          image: prod.image || (prod.images && prod.images[0]) || '',
          expiryDate: prod.expiryDate ? prod.expiryDate.split('T')[0] : '',
          expiryAlertDays: prod.expiryAlertDays ?? '30',
          preferredVendorId: prod.preferredVendorId?._id || prod.preferredVendorId || '',
          allowBackorder: !!prod.allowBackorder,
          isDropship: !!prod.isDropship,
          trackingType: prod.trackingType || 'none',
          isComposite: !!prod.isComposite,
          soldByWeight: !!prod.soldByWeight,
        });
        setComponents((prod.components || []).map(c => ({
          productId: c.productId?._id || c.productId,
          name: c.name,
          quantity: c.quantity,
        })));
        setCustomFieldValues(prod.customFields || {});
        if (prod.image || (prod.images && prod.images[0])) {
          setImagePreview(prod.image || prod.images[0]);
        }
        if (prod.attributes) {
          setAttributes({
            size: prod.attributes.size || '',
            color: prod.attributes.color || '',
            imei: prod.attributes.imei || '',
            serialNumber: prod.attributes.serialNumber || '',
            weight: prod.attributes.weight || '',
            warranty: prod.attributes.warranty || '',
            brand: prod.attributes.brand || '',
          });
          if (prod.attributes.size || prod.attributes.imei || prod.attributes.serialNumber) {
            setShowCustomAttr(true);
          }
        }
      }
    } catch (error) {
      toast.error('Failed to fetch product details');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'image') {
      setImagePreview(value);
    }
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error('Image size must be less than 5MB');
    }

    // The image is stored as a base64 string in the product document, and
    // every POS/product-list load downloads it again — so a raw multi-MB
    // photo makes catalog payloads enormous and chokes rendering on weaker
    // machines. Downscale to max 800px JPEG before storing.
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 800;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // White backing so transparent PNG areas don't turn black in JPEG.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let base64Data;
        try {
          base64Data = canvas.toDataURL('image/jpeg', 0.8);
        } catch {
          base64Data = reader.result; // canvas blocked — keep the original
        }
        setFormData(prev => ({ ...prev, image: base64Data }));
        setImagePreview(base64Data);
        toast.success('Image compressed & ready');
      };
      img.onerror = () => {
        // Not decodable as an image in this browser — store as-is.
        setFormData(prev => ({ ...prev, image: reader.result }));
        setImagePreview(reader.result);
        toast.success('Image selected');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const generateSKU = () => {
    const prefix = formData.name ? formData.name.substring(0, 3).toUpperCase() : 'PRD';
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    setFormData(prev => ({ ...prev, sku: `${prefix}-${randomNum}` }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const payload = {
        ...formData,
        categoryId: formData.category, // Send categoryId explicitly for backend Mongoose model
        attributes,
        customFields: customFieldValues,
        price: Number(formData.price),
        costPrice: Number(formData.costPrice),
        stock: Number(formData.stock),
        preferredVendorId: formData.preferredVendorId || null,
        // 'custom'/'' aren't real ids — the numeric taxRate stands alone then.
        taxRateId: formData.taxRateId && formData.taxRateId !== 'custom' ? formData.taxRateId : null,
        taxRate: Number(formData.taxRate) || 0,
        components: formData.isComposite
          ? components.filter(c => c.productId && Number(c.quantity) > 0)
          : [],
      };
      if (formData.isComposite && payload.components.length === 0) {
        toast.error('A bundle needs at least one component');
        setLoading(false);
        return;
      }

      if (isEditing) {
        await ProductsAPI.updateProduct(id, payload);
        toast.success('Product updated successfully!');
      } else {
        await ProductsAPI.createProduct(payload);
        toast.success('Product created successfully!');
      }

      // Clear legacy localStorage cache
      localStorage.removeItem('pos_products');
      localStorage.removeItem('pos_products_modified');

      navigate('/products');
    } catch (error) {
      console.error('Save product error:', error);
      toast.error(error.response?.data?.message || `Failed to ${isEditing ? 'update' : 'create'} product`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>Fill in the product details and upload image to Cloudinary</p>
        </div>
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Product Name</label>
              <input className="form-input" type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="e.g. Wireless Noise Cancelling Headphones" />
            </div>

            <div className="form-group">
              <label className="form-label">SKU / Barcode</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" type="text" name="sku" value={formData.sku} onChange={handleChange} required style={{ flex: 1 }} placeholder="SKU-1002" />
                <button type="button" onClick={generateSKU} className="btn btn-outline" title="Generate Random SKU">
                  <FiRefreshCw />
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="form-select" name="category" value={formData.category} onChange={handleChange} required style={{ flex: 1 }}>
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat._id || cat.id} value={cat._id || cat.id}>{cat.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowAddCategory(!showAddCategory)} className="btn btn-outline" style={{ padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Add New Category">
                  <FiPlus />
                </button>
              </div>

              {showAddCategory && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', background: 'var(--background)', padding: '8px', borderRadius: '8px', border: '1.5px solid var(--border)' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="New Category Name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateCategory())}
                  />
                  <button type="button" onClick={handleCreateCategory} disabled={creatingCategory} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {creatingCategory ? '...' : 'Add'}
                  </button>
                  <button type="button" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }} className="btn btn-outline" style={{ padding: '8px 14px', fontSize: '13px' }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Selling Price ($)</label>
              <input className="form-input" type="number" step="0.01" name="price" value={formData.price} onChange={handleChange} required placeholder="99.99" />
            </div>

            <div className="form-group">
              <label className="form-label">Cost Price ($)</label>
              <input className="form-input" type="number" step="0.01" name="costPrice" value={formData.costPrice} onChange={handleChange} placeholder="50.00" />
            </div>

            <div className="form-group">
              <label className="form-label">Tax Rate</label>
              <select
                className="form-select"
                value={formData.taxRateId}
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'custom') {
                    setFormData(prev => ({ ...prev, taxRateId: 'custom' }));
                  } else if (v === '') {
                    setFormData(prev => ({ ...prev, taxRateId: '', taxRate: '0' }));
                  } else {
                    const tr = taxRates.find(t => t._id === v);
                    setFormData(prev => ({ ...prev, taxRateId: v, taxRate: tr ? String(tr.rate) : prev.taxRate }));
                  }
                }}
              >
                <option value="">Default rate</option>
                {taxRates.map(t => <option key={t._id} value={t._id}>{t.name} ({t.rate}%){t.isDefault ? ' ★' : ''}</option>)}
                <option value="custom">Custom %…</option>
              </select>
              {formData.taxRateId === 'custom' && (
                <input className="form-input" type="number" step="0.01" min="0" max="100" name="taxRate"
                  style={{ marginTop: '6px' }} placeholder="Custom tax %"
                  value={formData.taxRate} onChange={handleChange} />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Unit</label>
              <select className="form-select" name="unit" value={formData.unit} onChange={handleChange}>
                <option value="pcs">Pieces (pcs)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="g">Grams (g)</option>
                <option value="l">Liters (L)</option>
                <option value="box">Box</option>
              </select>
            </div>

            {/* Cloudinary Image Upload Dropzone */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiImage /> Product Image (Cloudinary Powered)
              </label>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
                {imagePreview ? (
                  <div style={{ position: 'relative', width: '90px', height: '90px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
                    <img src={imagePreview} alt="Product Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => { setImagePreview(null); setFormData(prev => ({ ...prev, image: '' })); }}
                      style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '90px', height: '90px', borderRadius: '8px', background: '#0F172A', border: '1px dashed #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '12px' }}>
                    <FiImage size={24} />
                    <span>No Image</span>
                  </div>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="btn btn-outline" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', width: 'fit-content' }}>
                    <FiUploadCloud size={18} /> Upload Image File to Cloudinary
                    <input type="file" accept="image/*" onChange={handleImageFileChange} style={{ display: 'none' }} />
                  </label>
                  <input
                    className="form-input"
                    type="text"
                    name="image"
                    value={formData.image.startsWith('data:') ? '' : formData.image}
                    onChange={handleChange}
                    placeholder="...or paste external image URL (https://...)"
                    style={{ fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Description</label>
              <textarea className="form-textarea" name="description" value={formData.description} onChange={handleChange} rows="3" placeholder="Enter product specifications or details..."></textarea>
            </div>

            {/* Dynamic Category Specifications Section */}
            {(getCategoryType() === 'clothing' || (showCustomAttr && getCategoryType() === 'general')) && (
              <div style={{ gridColumn: '1 / -1', background: 'var(--surface, #F8FAFC)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border, #E2E8F0)', marginTop: '8px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text, #1E293B)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👕 Clothing & Apparel Specifications
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Sizes (e.g. S, M, L, XL, 32)</label>
                    <input className="form-input" type="text" name="size" value={attributes.size} onChange={handleAttrChange} placeholder="e.g. S, M, L, XL" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Color</label>
                    <input className="form-input" type="text" name="color" value={attributes.color} onChange={handleAttrChange} placeholder="e.g. Black, Navy Blue, Red" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Brand / Label</label>
                    <input className="form-input" type="text" name="brand" value={attributes.brand} onChange={handleAttrChange} placeholder="e.g. Nike, Zara, Adidas" />
                  </div>
                </div>
              </div>
            )}

            {(getCategoryType() === 'electronics' || (showCustomAttr && getCategoryType() === 'general')) && (
              <div style={{ gridColumn: '1 / -1', background: 'var(--surface, #F8FAFC)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border, #E2E8F0)', marginTop: '8px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text, #1E293B)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚡ Electronics & Technical Specifications
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>IMEI Number</label>
                    <input className="form-input" type="text" name="imei" value={attributes.imei} onChange={handleAttrChange} placeholder="e.g. 356984102948123" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Serial Number</label>
                    <input className="form-input" type="text" name="serialNumber" value={attributes.serialNumber} onChange={handleAttrChange} placeholder="e.g. SN-8942-X1" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Color</label>
                    <input className="form-input" type="text" name="color" value={attributes.color} onChange={handleAttrChange} placeholder="e.g. Space Gray, Silver" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Weight</label>
                    <input className="form-input" type="text" name="weight" value={attributes.weight} onChange={handleAttrChange} placeholder="e.g. 1.5 kg or 200g" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Warranty Period</label>
                    <select className="form-select" name="warranty" value={attributes.warranty} onChange={handleAttrChange}>
                      <option value="">No Warranty</option>
                      <option value="6 Months">6 Months</option>
                      <option value="1 Year">1 Year</option>
                      <option value="2 Years">2 Years</option>
                      <option value="3 Years">3 Years</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Brand / Manufacturer</label>
                    <input className="form-input" type="text" name="brand" value={attributes.brand} onChange={handleAttrChange} placeholder="e.g. Apple, Samsung, Sony" />
                  </div>
                </div>
              </div>
            )}

            {getCategoryType() === 'general' && (
              <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setShowCustomAttr(!showCustomAttr)}
                  style={{ background: 'none', border: 'none', color: '#16A34A', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {showCustomAttr ? '− Hide Extended Attributes' : '+ Add Extended Specifications (Size, Color, Warranty, IMEI)'}
                </button>
              </div>
            )}
            
            {!isEditing && (
              <div className="form-group">
                <label className="form-label">Initial Stock Quantity</label>
                <input className="form-input" type="number" name="stock" value={formData.stock} onChange={handleChange} />
              </div>
            )}

            {/* ── Expiry Date Tracking ── */}
            <div style={{ gridColumn: '1 / -1', background: 'var(--surface, #F8FAFC)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border, #E2E8F0)', marginTop: '8px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text, #1E293B)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📅 Expiry Date Tracking
                <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748B' }}>— leave blank if product does not expire</span>
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px' }}>Expiry Date</label>
                  <input
                    className="form-input"
                    type="date"
                    name="expiryDate"
                    value={formData.expiryDate}
                    onChange={handleChange}
                  />
                  {formData.expiryDate && (() => {
                    const today = new Date();
                    const exp   = new Date(formData.expiryDate);
                    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0)  return <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 700, marginTop: '4px', display: 'block' }}>⛔ Already Expired!</span>;
                    if (diffDays <= 30) return <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 600, marginTop: '4px', display: 'block' }}>⚠️ Expires in {diffDays} day{diffDays !== 1 ? 's' : ''}</span>;
                    return <span style={{ fontSize: '11px', color: '#16A34A', marginTop: '4px', display: 'block' }}>✅ Expires in {diffDays} days</span>;
                  })()}
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px' }}>Alert Me (days before expiry)</label>
                  <select className="form-select" name="expiryAlertDays" value={formData.expiryAlertDays} onChange={handleChange}>
                    <option value="7">7 days before</option>
                    <option value="14">14 days before</option>
                    <option value="30">30 days before</option>
                    <option value="60">60 days before</option>
                    <option value="90">90 days before</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Fulfillment Sourcing ── */}
            <div style={{ gridColumn: '1 / -1', background: 'var(--surface, #F8FAFC)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border, #E2E8F0)', marginTop: '8px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text, #1E293B)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚚 Fulfillment Sourcing
                <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748B' }}>— backorders & dropshipping</span>
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px' }}>Preferred Vendor</label>
                  <select
                    className="form-select"
                    value={formData.preferredVendorId}
                    onChange={e => setFormData(prev => ({ ...prev, preferredVendorId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {vendors.map(v => (
                      <option key={v._id} value={v._id}>
                        {v.name}{v.isDropshipper ? ' (dropshipper)' : ''}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                    Used when auto-creating replenishment or dropship POs
                  </span>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.allowBackorder}
                      onChange={e => setFormData(prev => ({ ...prev, allowBackorder: e.target.checked }))}
                    />
                    Allow backorder when out of stock
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isDropship}
                      onChange={e => setFormData(prev => ({ ...prev, isDropship: e.target.checked }))}
                    />
                    Dropship product (vendor ships straight to the customer)
                  </label>
                </div>
              </div>
            </div>

            {/* ── Unit Tracking & Bundles ── */}
            <div style={{ gridColumn: '1 / -1', background: 'var(--surface, #F8FAFC)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border, #E2E8F0)', marginTop: '8px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text, #1E293B)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔎 Unit Tracking & Bundles
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '12px' }}>Tracking Type</label>
                  <select
                    className="form-select"
                    value={formData.trackingType}
                    onChange={e => setFormData(prev => ({ ...prev, trackingType: e.target.value }))}
                    disabled={formData.isComposite}
                  >
                    <option value="none">None (plain counted stock)</option>
                    <option value="serial">Serial numbers (each unit unique)</option>
                    <option value="batch">Batches / lots (with expiry)</option>
                  </select>
                  <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                    Serial: checkout asks which exact units are sold. Batch: lots are consumed first-expiry-first automatically.
                  </span>
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isComposite}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        isComposite: e.target.checked,
                        trackingType: e.target.checked ? 'none' : prev.trackingType,
                      }))}
                    />
                    Composite item (bundle/kit) — selling it deducts component stock
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.soldByWeight}
                      onChange={e => setFormData(prev => ({ ...prev, soldByWeight: e.target.checked }))}
                    />
                    Sold by weight — the POS asks for a weight (scale or manual); price is per {formData.unit && formData.unit !== 'pcs' ? formData.unit : 'kg'}
                  </label>
                </div>
              </div>

              {formData.isComposite && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <select className="form-select" style={{ flex: 1 }} value={componentPickerId}
                      onChange={e => setComponentPickerId(e.target.value)}>
                      <option value="">Add a component product...</option>
                      {allProducts
                        .filter(p => p._id !== id && !p.isComposite && !components.some(c => c.productId === p._id))
                        .map(p => <option key={p._id} value={p._id}>{p.name} (stock: {p.stock ?? 0})</option>)}
                    </select>
                    <button type="button" className="btn btn-outline" disabled={!componentPickerId}
                      onClick={() => {
                        const p = allProducts.find(x => x._id === componentPickerId);
                        if (!p) return;
                        setComponents(prev => [...prev, { productId: p._id, name: p.name, quantity: 1 }]);
                        setComponentPickerId('');
                      }}>
                      <FiPlus /> Add
                    </button>
                  </div>
                  {components.length > 0 && (
                    <table className="data-table">
                      <thead>
                        <tr><th>Component</th><th style={{ width: '140px' }}>Qty per bundle</th><th style={{ width: '50px' }}></th></tr>
                      </thead>
                      <tbody>
                        {components.map((c, idx) => (
                          <tr key={c.productId}>
                            <td>{c.name}</td>
                            <td>
                              <input className="form-input" type="number" min="1" value={c.quantity}
                                onChange={e => setComponents(prev => prev.map((it, i) =>
                                  i === idx ? { ...it, quantity: Number(e.target.value) || 1 } : it))} />
                            </td>
                            <td>
                              <button type="button" className="btn btn-danger btn-sm"
                                onClick={() => setComponents(prev => prev.filter((_, i) => i !== idx))}>
                                <FiX />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <span style={{ fontSize: '11px', color: '#64748B', marginTop: '6px', display: 'block' }}>
                    The bundle's own stock is ignored — availability comes from its components. Bundle price is the Selling Price above.
                  </span>
                </div>
              )}
            </div>
          </div>

          <CustomFieldsSection
            entity="product"
            values={customFieldValues}
            onChange={setCustomFieldValues}
          />

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/products')}>
              <FiX /> Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <FiSave /> {loading ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;
