import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiSearch, FiPlus, FiMinus, FiX, FiClock, FiShoppingCart, FiCheckCircle, FiPrinter, FiMaximize, FiMinimize, FiUser, FiBarChart2, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { ProductsAPI, CategoriesAPI, SalesAPI, CustomersAPI, CreditNotesAPI, PriceListsAPI, HeldBillsAPI, ShiftsAPI, TaxRatesAPI } from '../../services/api';
import { formatCurrency, getCurrencySymbol } from '../../utils/currency';
import { getActiveBranchId } from '../../utils/branch';
import MobileMoneyModal from './MobileMoneyModal';
import BarcodeScanner from '../../components/BarcodeScanner';
import QuickCreateCustomerModal from '../../components/QuickCreateCustomerModal';
import SerialPickerModal from './SerialPickerModal';
import WeightModal from './WeightModal';
import SplitTenderModal from './SplitTenderModal';
import HeldBillsModal from './HeldBillsModal';
import ReprintModal from './ReprintModal';
import ShiftModal from './ShiftModal';
import { printThermalReceipt, openCashDrawer } from './thermalPrint';
import './POSTerminal.css';

const POSTerminal = () => {
  const [categories, setCategories] = useState(['All']);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [showCashModal, setShowCashModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [mobileProvider, setMobileProvider] = useState('pesapal');
  const [cashReceived, setCashReceived] = useState('');
  const [completedOrder, setCompletedOrder] = useState(null);
  const [orderNumber, setOrderNumber] = useState('SO-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900));
  const [customers, setCustomers] = useState([{ _id: '', name: 'Walk-in Customer' }]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [storeCreditAvailable, setStoreCreditAvailable] = useState(0);
  // The selected customer's price list (null = standard prices).
  const [priceList, setPriceList] = useState(null);
  // {product} while the serial-selection modal is open for that product.
  const [serialPicker, setSerialPicker] = useState(null);
  // {product} while the weight-entry modal is open for that product.
  const [weightPicker, setWeightPicker] = useState(null);
  // POS billing tools
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [currentShift, setCurrentShift] = useState(null);
  // Fallback tax rate for products with no rate of their own — the tenant's
  // ★ default named rate, else the legacy localStorage percentage.
  // Last-resort fallback is 0, never an invented 10% — the server's ★ default
  // rate (fetched below, and re-checked on window focus) is the real source.
  const [defaultTaxRate, setDefaultTaxRate] = useState(() => Number(localStorage.getItem('pos_tax_rate') || 0));

  // Expanded cart: the narrow side panel can't show a long order at once, so
  // this blows the cart up into a full-height overlay for review.
  const [cartExpanded, setCartExpanded] = useState(false);
  // Delivery order: when enabled the sale carries a shipping address and
  // enters the fulfillment pipeline (Shipments).
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({ name: '', phone: '', address: '', city: '' });
  const [processingPayment, setProcessingPayment] = useState(false);
  const isSubmittingSaleRef = React.useRef(false);
  const cartIdempotencyKeyRef = React.useRef(null);
  const [discount, setDiscount] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAmountPaid, setCreditAmountPaid] = useState('');
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  const { user } = useAuth();
  const location = useLocation();
  const isFullscreen = location.pathname === '/pos';

  // Guards against setState-after-unmount if the cashier navigates away from
  // the POS screen while a catalog refresh is still in flight. Must reset to
  // true on mount (see the matching note in Dashboard.jsx) — StrictMode's
  // dev-only mount/cleanup/remount cycle otherwise leaves this permanently
  // false after the very first render, silently blocking every setState in
  // this component (including the one that turns off the loading spinner).
  const isMountedRef = React.useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setStoreCreditAvailable(0);
      return;
    }
    CreditNotesAPI.getAvailableForCustomer(selectedCustomer)
      .then(res => {
        if (isMountedRef.current && res.data?.success) setStoreCreditAvailable(res.data.totalAvailable || 0);
      })
      .catch(() => { if (isMountedRef.current) setStoreCreditAvailable(0); });
  }, [selectedCustomer]);

  // ── Price list: load the selected customer's scheme ──────────────────────
  useEffect(() => {
    const cust = customers.find(c => c._id === selectedCustomer);
    const plId = cust?.priceListId;
    if (!plId) { setPriceList(null); return; }
    PriceListsAPI.getPriceList(plId)
      .then(res => {
        if (!isMountedRef.current) return;
        const pl = res.data?.data;
        setPriceList(pl && pl.isActive ? pl : null);
      })
      .catch(() => { if (isMountedRef.current) setPriceList(null); });
  }, [selectedCustomer, customers]);

  // Effective unit price under the active price list. basePrice (the
  // standard price) is always the anchor, so repricing never compounds.
  const listPriceFor = (basePrice, productId) => {
    if (!priceList) return basePrice;
    if (priceList.type === 'percent') {
      return Math.max(0, Math.round(basePrice * (1 + (Number(priceList.percentage) || 0) / 100) * 100) / 100);
    }
    const item = (priceList.items || []).find(i =>
      String(i.productId?._id || i.productId) === String(productId));
    return item ? Number(item.customPrice) : basePrice;
  };

  // Reprice the whole cart whenever the applicable price list changes
  // (customer selected/cleared mid-order).
  useEffect(() => {
    setCart(prev => prev.map(item => ({
      ...item,
      price: listPriceFor(item.basePrice ?? item.price, item.id),
    })));
  }, [priceList]);

  // How many bundles the current component stock can assemble — a composite
  // has no stock of its own.
  const bundleAvailable = (product) => {
    if (!product.isComposite || !product.components?.length) return 0;
    let min = Infinity;
    for (const c of product.components) {
      const comp = products.find(p => String(p.id) === String(c.productId));
      if (!comp) return 0;
      min = Math.min(min, Math.floor((comp.stock || 0) / (Number(c.quantity) || 1)));
    }
    return min === Infinity ? 0 : min;
  };

  const fetchData = async () => {
    try {
      setLoadingProducts(true);
      const activeBranchId = localStorage.getItem('active_branch_id');
      const [prodRes, catRes, custRes] = await Promise.all([
        ProductsAPI.getProducts({ limit: 100, branchId: activeBranchId || undefined }),
        CategoriesAPI.getCategories(),
        CustomersAPI.getCustomers({ limit: 50 }),
      ]);
      if (!isMountedRef.current) return;
      if (prodRes.data?.data?.length) {
        const apiProds = prodRes.data.data.map(p => ({
          id: p._id,
          name: p.name,
          price: p.price,
          // Standard price kept separately so price-list repricing (and
          // un-repricing when the customer changes) never compounds.
          basePrice: p.price,
          sku: p.sku,
          stock: Number(p.stock ?? 0),
          category: p.categoryId?.name || 'General',
          allowBackorder: !!p.allowBackorder,
          isDropship: !!p.isDropship,
          trackingType: p.trackingType || 'none',
          isComposite: !!p.isComposite,
          components: p.components || [],
          soldByWeight: !!p.soldByWeight,
          unit: p.unit || 'piece',
          taxRate: Number(p.taxRate) || 0,
          image: p.images?.[0] || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=300&q=80'
        }));
        setProducts(apiProds);
      } else {
        setProducts([]);
      }
      if (catRes.data?.data?.length) {
        const apiCats = ['All', ...catRes.data.data.map(c => c.name)];
        setCategories(apiCats);
      }
      if (custRes.data?.data?.length) {
        setCustomers([{ _id: '', name: 'Walk-in Customer' }, ...custRes.data.data]);
      }
    } catch (err) {
      console.error('Fetch POS catalog error:', err);
      if (isMountedRef.current) setProducts([]);
    } finally {
      if (isMountedRef.current) setLoadingProducts(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleBranchChange = () => fetchData();
    window.addEventListener('branchChanged', handleBranchChange);
    return () => window.removeEventListener('branchChanged', handleBranchChange);
  }, []);

  const refreshHeldCount = () => {
    HeldBillsAPI.getHeldBills()
      .then(res => { if (isMountedRef.current && res.data?.success) setHeldCount((res.data.data || []).length); })
      .catch(() => {});
  };

  useEffect(() => {
    refreshHeldCount();
    ShiftsAPI.getCurrent()
      .then(res => { if (isMountedRef.current && res.data?.success) setCurrentShift(res.data.data); })
      .catch(() => {});
    // Named tax rates: the ★ default overrides the legacy localStorage rate.
    // Re-synced whenever the window regains focus, so a rate changed in
    // Settings on one machine reaches every open POS tab without a reload.
    const syncDefaultTax = () => {
      TaxRatesAPI.getTaxRates()
        .then(res => {
          if (!isMountedRef.current || !res.data?.success) return;
          const def = (res.data.data || []).find(t => t.isDefault && t.isActive);
          if (def) {
            setDefaultTaxRate(Number(def.rate) || 0);
            // Mirror to the per-machine cache so the next cold start paints
            // with the right rate before this fetch resolves.
            try { localStorage.setItem('pos_tax_rate', String(def.rate)); } catch {}
          }
        })
        .catch(() => {});
    };
    syncDefaultTax();
    window.addEventListener('focus', syncDefaultTax);
    return () => window.removeEventListener('focus', syncDefaultTax);
  }, []);

  // ── Hold & recall ────────────────────────────────────────────────────────
  const handleHold = async () => {
    if (cart.length === 0) return toast.error('Nothing to hold — cart is empty');
    const custName = customers.find(c => c._id === selectedCustomer)?.name;
    const label = window.prompt('Label for this held bill:',
      custName && custName !== 'Walk-in Customer' ? custName : `Held ${new Date().toLocaleTimeString()}`);
    if (label === null) return;
    try {
      await HeldBillsAPI.holdBill({
        cart,
        label,
        customerId: selectedCustomer || undefined,
        customerName: custName,
        discount: Number(discount) || 0,
        branchId: getActiveBranchId() || undefined,
      });
      toast.success('Bill held — recall it any time');
      setCart([]);
      setDiscount(0);
      setSelectedCustomer('');
      refreshHeldCount();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to hold bill');
    }
  };

  const handleRecall = (bill) => {
    if (cart.length > 0 && !window.confirm('Recalling replaces the current cart. Continue?')) return;
    setCart(Array.isArray(bill.cart) ? bill.cart : []);
    setDiscount(bill.discount || 0);
    setSelectedCustomer(bill.customerId || '');
    setShowHeldModal(false);
    refreshHeldCount();
    toast.success(`Recalled "${bill.label || 'held bill'}"`);
  };

  const filteredProducts = products.filter(p => {
    const matchesCat = activeCategory === 'All' || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleBarcodeScan = (code) => {
    const product = products.find(p => p.sku && p.sku.toLowerCase() === code.toLowerCase());
    if (product) {
      addToCart(product);
      toast.success(`Added: ${product.name}`);
    } else {
      setSearchQuery(code);
      toast(`No product found for barcode: ${code}`, { icon: '🔍' });
    }
    setShowScanner(false);
  };

  const addToCart = (product) => {
    // Sold by weight: quantity comes from the scale (or manual entry), not
    // from counting clicks — the weight modal sets the line.
    if (product.soldByWeight) {
      if (product.stock <= 0 && !product.allowBackorder) {
        return toast.error(`"${product.name}" is Out of Stock!`);
      }
      setWeightPicker({ product });
      return;
    }

    // Serial-tracked: the cashier must pick the exact units — the picker
    // modal sets the cart line (quantity = serials chosen).
    if (product.trackingType === 'serial') {
      setSerialPicker({ product });
      return;
    }

    // Composite (bundle): availability comes from its components' stock.
    if (product.isComposite) {
      const avail = bundleAvailable(product);
      const existing = cart.find(item => item.id === product.id);
      const currentQty = existing ? existing.qty : 0;
      if (currentQty + 1 > avail) {
        return toast.error(avail <= 0
          ? `"${product.name}" can't be assembled — a component is out of stock`
          : `Only ${avail} bundle(s) can be assembled from current component stock`);
      }
      if (existing) {
        setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
      } else {
        setCart([...cart, { ...product, price: listPriceFor(product.basePrice, product.id), qty: 1 }]);
      }
      return;
    }

    // Dropship products never touch local stock, and backorder-enabled
    // products may sell past what's on hand (the shortfall is recorded as a
    // backorder server-side). Everything else keeps the hard stock guard.
    const dropship = product.isDropship;
    if (product.stock <= 0 && !dropship && !product.allowBackorder) {
      return toast.error(`"${product.name}" is Out of Stock!`);
    }
    const existing = cart.find(item => item.id === product.id);
    const currentQty = existing ? existing.qty : 0;

    if (!dropship && currentQty + 1 > product.stock) {
      if (!product.allowBackorder) {
        return toast.error(`Cannot add more than available stock (${product.stock} available)`);
      }
      toast(`"${product.name}" exceeds stock — ${currentQty + 1 - product.stock} unit(s) will be backordered`, { icon: '⏳' });
    }

    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...product, price: listPriceFor(product.basePrice, product.id), qty: 1, dropship }]);
    }
  };

  // Confirm handler for the weight modal: the weight IS the line quantity
  // (fractional), replacing any existing line for the product.
  const applyWeight = (product, weight) => {
    setWeightPicker(null);
    if (!product.allowBackorder && weight > product.stock) {
      return toast.error(`Only ${product.stock} ${product.unit || 'kg'} in stock`);
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: weight } : item);
      }
      return [...prev, {
        ...product,
        price: listPriceFor(product.basePrice ?? product.price, product.id),
        qty: weight,
      }];
    });
  };

  // Confirm handler for the serial-picker modal: quantity IS the number of
  // serials chosen; zero removes the line.
  const applySerialSelection = (product, serials) => {
    setSerialPicker(null);
    if (serials.length === 0) {
      setCart(prev => prev.filter(item => item.id !== product.id));
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id
          ? { ...item, qty: serials.length, serials }
          : item);
      }
      return [...prev, {
        ...product,
        price: listPriceFor(product.basePrice ?? product.price, product.id),
        qty: serials.length,
        serials,
      }];
    });
  };

  const updateQty = (id, change) => {
    const itemInCart = cart.find(item => item.id === id);
    if (!itemInCart) return;

    // Weighed lines change quantity by re-weighing, not +/-.
    if (itemInCart.soldByWeight) {
      setWeightPicker({ product: itemInCart });
      return;
    }

    // Serialized lines change quantity by re-picking serials, not +/-.
    if (itemInCart.trackingType === 'serial') {
      setSerialPicker({ product: itemInCart });
      return;
    }

    if (change > 0 && itemInCart.isComposite) {
      const avail = bundleAvailable(itemInCart);
      if (itemInCart.qty + 1 > avail) {
        return toast.error(`Only ${avail} bundle(s) can be assembled from current component stock`);
      }
    } else if (change > 0 && !itemInCart.dropship && itemInCart.qty + 1 > itemInCart.stock) {
      if (!itemInCart.allowBackorder) {
        return toast.error(`Maximum available stock reached (${itemInCart.stock})`);
      }
      toast(`${itemInCart.qty + 1 - itemInCart.stock} unit(s) of "${itemInCart.name}" will be backordered`, { icon: '⏳' });
    }

    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = item.qty + change;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // ── Per-line tax ─────────────────────────────────────────────────────────
  // Each line uses its product's own tax rate (falling back to the tenant
  // default), and a tax-exempt customer zeroes every line. The order-level
  // discount is spread across lines by their share of the subtotal before
  // tax applies.
  const customerIsExempt = !!customers.find(c => c._id === selectedCustomer)?.taxExempt;
  const lineRateFor = (item) => customerIsExempt ? 0
    : (Number(item.taxRate) > 0 ? Number(item.taxRate) : defaultTaxRate);
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discountAmt = Math.min(Number(discount) || 0, subtotal);
  const lineTaxFor = (item) => {
    const lineGross = item.price * item.qty;
    const discountShare = subtotal > 0 ? discountAmt * (lineGross / subtotal) : 0;
    return Math.max(0, lineGross - discountShare) * (lineRateFor(item) / 100);
  };
  const tax = cart.reduce((sum, item) => sum + lineTaxFor(item), 0);
  const taxable = subtotal - discountAmt;
  const taxRatePercent = taxable > 0 ? Math.round((tax / taxable) * 1000) / 10 : 0;
  const total = taxable + tax;

  const handlePayClick = () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    if (paymentMethod === 'cash') {
      setShowCashModal(true);
    } else if (paymentMethod === 'pesapal') {
      setMobileProvider('pesapal');
      setShowMobileModal(true);
    } else if (paymentMethod === 'credit') {
      if (!selectedCustomer) {
        return toast.error(' Please select a customer for Credit Sales!');
      }
      // Check if customer is credit-blocked
      const cust = customers.find(c => c._id === selectedCustomer);
      if (cust?.creditBlocked) {
        return toast.error(`Credit is BLOCKED for "${cust.name}". Admin must clear the block first.`);
      }
      setShowCreditModal(true);
    } else if (paymentMethod === 'storeCredit') {
      if (!selectedCustomer) {
        return toast.error('Please select a customer to redeem store credit.');
      }
      if (storeCreditAvailable < total) {
        return toast.error('Selected customer does not have enough store credit to cover this total.');
      }
      // Fully covered by credit — no separate "amount tendered" step needed.
      handleCompletePayment('Store Credit', { storeCreditApplied: total });
    } else if (paymentMethod === 'splitPay') {
      setShowSplitModal(true);
    }
  };

  const handleSplitConfirm = (tenders) => {
    setShowSplitModal(false);
    handleCompletePayment('Split', {}, { payments: tenders });
  };


  const handleMobileMoneySuccess = (providerName, details) => {
    setShowMobileModal(false);
    const txId = typeof details === 'string' ? details : details?.txId;
    const phone = typeof details === 'object' ? details?.phone : null;
    handleCompletePayment(providerName, {
      momoProvider: providerName === 'Airtel Money' ? 'AIRTEL' : providerName === 'MTN MoMo' ? 'MTN' : providerName,
      momoPhoneNumber: phone,
      momoTransactionId: txId,
    });
  };

  const handleCreditConfirm = () => {
    const paid = parseFloat(creditAmountPaid) || 0;
    const balance = Math.max(0, total - paid);
    setShowCreditModal(false);
    handleCompletePayment('Credit Sale', {
      amountPaid: paid,
      balanceDue: balance,
      balanceDueDate: creditDueDate,
    });
  };

  const handleCompletePayment = async (methodDetail = 'Cash', pmtDetails = {}, extraPayload = {}) => {
    // ⚡ INSTANT SYNCHRONOUS REF GUARD — Blocks multi-click / double-tap instantly
    if (isSubmittingSaleRef.current || processingPayment) {
      console.warn('[POS] Double-click / duplicate sale attempt blocked instantly on frontend.');
      return;
    }
    isSubmittingSaleRef.current = true;
    setProcessingPayment(true);

    // For Cash: derive amounts from cashReceived input
    // For Credit / Card / Mobile / Store Credit: cashAmt and change must
    // always be 0 — never bleed from a previous cash session.
    const isCreditPayment = ['Credit Sale', 'Pay Later', 'credit', 'CREDIT', 'Store Credit'].includes(methodDetail);
    const cashAmt   = isCreditPayment ? 0 : (parseFloat(cashReceived) || total);
    const changeAmt = isCreditPayment ? 0 : Math.max(0, cashAmt - total);

    // If cash, auto-fill paymentDetails
    if (methodDetail === 'Cash') {
      pmtDetails = {
        cashReceived: cashAmt,
        changeReturned: changeAmt,
      };
    }

    const order = {
      orderNumber,
      items: [...cart],
      subtotal,
      discount: discountAmt,
      tax,
      total,
      paymentMethod: methodDetail,
      paymentDetails: pmtDetails,
      authCode: pmtDetails.cardAuthCode || null,
      cardLast4: pmtDetails.cardLast4 || null,
      cardNetwork: pmtDetails.cardNetwork || null,
      transactionId: pmtDetails.momoTransactionId || pmtDetails.cardAuthCode || null,
      // Only set cashReceived on actual cash payments
      cashReceived: isCreditPayment ? 0 : cashAmt,
      change: isCreditPayment ? 0 : changeAmt,
      date: new Date().toLocaleString(),
      customerName: customers.find(c => c._id === selectedCustomer)?.name || 'Walk-in Customer',
    };

    // Save to backend with single Idempotency Key per checkout attempt
    try {
      const activeBranchId = getActiveBranchId();
      if (!cartIdempotencyKeyRef.current) {
        cartIdempotencyKeyRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `ik-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }
      const idempotencyKey = cartIdempotencyKeyRef.current;

      await SalesAPI.createSale({
        idempotencyKey,
        branchId: activeBranchId || undefined,
        items: cart.map(item => {
          // The backend recomputes totalTax by summing each item's own `tax`
          // field — computed here per line from the product's own rate (or
          // the tenant default), zeroed for tax-exempt customers. Same math
          // as the on-screen totals (lineTaxFor).
          const lineGross = item.price * item.qty;
          const itemTax = lineTaxFor(item);
          return {
            productId: item.id,
            name: item.name,
            sku: item.sku || '',
            quantity: item.qty,
            price: item.price,
            tax: Math.round(itemTax * 100) / 100,
            total: lineGross,
            // Fulfillment requests — the backend re-verifies both against the
            // Product's own flags before they have any effect.
            fulfillmentMode: item.dropship ? 'dropship' : undefined,
            allowBackorder: !item.dropship && item.allowBackorder && item.qty > item.stock ? true : undefined,
            // Exact units for serial-tracked lines (consumed atomically
            // server-side; the sale is rejected if any is no longer in stock).
            serials: item.serials?.length ? item.serials : undefined,
          };
        }),
        customerId: selectedCustomer || undefined,
        customerName: order.customerName,
        subtotal,
        discount: discountAmt,
        totalTax: tax,
        grandTotal: total,
        paymentMethod: methodDetail,
        paymentStatus: methodDetail === 'Credit Sale' ? 'unpaid' : 'paid',
        transactionId: pmtDetails.momoTransactionId || pmtDetails.cardAuthCode || null,
        paymentDetails: pmtDetails,
        amountPaid: pmtDetails.amountPaid,
        balanceDue: pmtDetails.balanceDue,
        balanceDueDate: pmtDetails.balanceDueDate,
        storeCreditApplied: pmtDetails.storeCreditApplied,
        cashierId: user?._id,
        // Delivery orders carry a shipping address, which puts the sale into
        // the fulfillment pipeline (Shipments) server-side.
        shippingAddress: deliveryEnabled && deliveryAddress.address ? deliveryAddress : undefined,
        // Split tenders and any other extension fields.
        ...extraPayload,
      });
      toast.success(methodDetail === 'Credit Sale' ? '📋 Credit sale recorded!' : 'Sale completed & saved!');

      // Only reached when the backend actually saved the sale — this used to
      // run unconditionally after the try/catch regardless of outcome, so a
      // failed save (network error, validation, expired session) still
      // showed "Payment Complete", printed a receipt, and cleared the cart
      // as if it had succeeded, with no sale record or stock deduction to
      // back it up.
      setCompletedOrder(order);
      setShowCashModal(false);
      setShowReceiptModal(true);
      setCart([]);
      setCashReceived('');
      setDiscount(0);
      setSelectedCustomer('');
      setDeliveryEnabled(false);
      setDeliveryAddress({ name: '', phone: '', address: '', city: '' });
      setOrderNumber('SO-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 9000));

      // The idempotency key is only retired on confirmed success. On failure
      // it's kept (see finally below) so a retry of the same attempt reuses
      // it — if the first request actually succeeded server-side but the
      // response was lost, the retry is recognized as a duplicate instead of
      // recording the sale twice.
      cartIdempotencyKeyRef.current = null;

      // Refresh product catalog so stock counts update immediately after sale
      fetchData();
    } catch (err) {
      console.error('Save sale API error:', err);
      const msg = err.response?.data?.message || 'Failed to save sale to server';
      toast.error(`⚠️ ${msg}`);
    } finally {
      isSubmittingSaleRef.current = false;
      setProcessingPayment(false);
    }

    // Receipt prints manually via the "Print Receipt" button in the modal
  };

  return (
    <div className={`pos-layout ${!isFullscreen ? 'in-sidebar-layout' : ''}`} style={{ height: isFullscreen ? '100vh' : 'calc(100vh - 90px)' }}>
      {/* Top Bar for Fullscreen Mode */}
      {isFullscreen && (
        <div className="pos-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link to="/dashboard" className="pos-back-btn">
              <FiArrowLeft /> Dashboard
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span className="pos-time"><FiClock /> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="pos-cashier">Cashier: <strong>{user?.name || 'Front Desk Cashier'}</strong> ({user?.role || 'cashier'})</span>

            <Link
              to="/terminal"
              className="pos-back-btn"
              style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '4px' }}
            >
              <FiMinimize /> Exit Fullscreen
            </Link>
          </div>
        </div>
      )}

      <div className="pos-content">
        {/* Left Panel - Products */}
        <div className="pos-products-panel">

          {/* ── Shortcut Buttons ─────────────────────────── */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowNewCustomer(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
              <FiUser style={{ fontSize: 14 }} /> New Customer
            </button>
            <button
              onClick={() => setShowScanner(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#1D4ED8' }}>
              <FiBarChart2 style={{ fontSize: 14 }} /> Scan Barcode
            </button>
            <Link to="/products/new"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#6D28D9' }}>
              <FiPlus style={{ fontSize: 14 }} /> New Product
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="pos-search-bar" style={{ flex: 1 }}>
              <FiSearch className="search-icon" />
              <input
                type="text"
                placeholder="Search products by name, SKU or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {!isFullscreen && (
              <Link
                to="/pos"
                className="btn-outline"
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '12px 16px', borderRadius: '8px', fontWeight: '600', backgroundColor: 'white' }}
              >
                <FiMaximize /> Fullscreen POS
              </Link>
            )}
          </div>


          <div className="pos-categories">
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {loadingProducts ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748B', fontSize: '15px' }}>
              Loading catalog from database...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748B', fontSize: '15px' }}>
              No products found.
            </div>
          ) : (
            <div className="products-grid">
              {filteredProducts.map(product => {
                // Out-of-stock still sellable when the product dropships or
                // allows backorders — only truly blocked items get greyed out.
                // Bundles are sellable while their components can assemble
                // at least one.
                const bundles = product.isComposite ? bundleAvailable(product) : 0;
                const sellable = product.isComposite
                  ? bundles > 0
                  : product.stock > 0 || product.isDropship || product.allowBackorder;
                const shownPrice = listPriceFor(product.basePrice ?? product.price, product.id);
                return (
                <div
                  key={product.id}
                  className="product-card"
                  style={{ opacity: sellable ? 1 : 0.6, cursor: sellable ? 'pointer' : 'not-allowed' }}
                  onClick={() => addToCart(product)}
                >
                  <div className="product-img-wrapper">
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=300&q=80'; }}
                    />
                    <span className="product-price">
                      {formatCurrency(shownPrice)}
                      {priceList && shownPrice !== (product.basePrice ?? product.price) && ' ★'}
                    </span>
                  </div>
                  <div className="product-info">
                    <h3 className="product-name">{product.name}</h3>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: product.isComposite ? '#0891B2' : product.isDropship ? '#2563EB' : product.stock <= 0 ? (product.allowBackorder ? '#D97706' : '#EF4444') : '#16A34A', display: 'block', marginTop: '2px' }}>
                      {product.isComposite
                        ? `📦 Bundle · ${bundles} available`
                        : product.isDropship
                          ? '🚚 Dropship'
                          : product.stock <= 0
                            ? (product.allowBackorder ? '⏳ Backorder OK' : '⚠️ Out of Stock')
                            : `Stock: ${product.stock}${product.trackingType === 'serial' ? ' · Serial' : product.trackingType === 'batch' ? ' · Batch' : ''}`}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel - Cart */}
        <div className={`pos-cart-panel ${cartExpanded ? 'expanded' : ''}`}>
          <div className="cart-header">
            <h2>Order #{orderNumber}</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                className="expand-cart-btn"
                onClick={() => setCartExpanded(v => !v)}
                title={cartExpanded ? 'Back to normal view' : 'Expand cart to review all items'}
              >
                {cartExpanded ? <><FiMinimize /> Close</> : <><FiMaximize /> Expand</>}
              </button>
              <button className="clear-cart-btn" onClick={() => setCart([])}>Clear</button>
            </div>
          </div>

          {/* POS billing toolbar: recall held bills, reprint, shift/drawer */}
          <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowHeldModal(true)}>
              ⏸ Recall{heldCount > 0 ? ` (${heldCount})` : ''}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowReprintModal(true)}>
              🖨 Reprint
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowShiftModal(true)}
              style={currentShift
                ? { background: '#F0FDF4', border: '1px solid #86EFAC', color: '#15803D', fontWeight: 700 }
                : { background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontWeight: 700 }}
              title={currentShift ? `Shift ${currentShift.sessionNumber} open` : 'No shift open — cash tracking inactive'}
            >
              {currentShift ? `🟢 ${currentShift.sessionNumber}` : '🔴 Open Shift'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (!deliveryEnabled) {
                  const cust = customers.find(c => c._id === selectedCustomer);
                  setDeliveryAddress(a => ({
                    name: a.name || cust?.name || '',
                    phone: a.phone || cust?.phone || '',
                    address: a.address || cust?.address || '',
                    city: a.city || '',
                  }));
                }
                setDeliveryEnabled(v => !v);
              }}
              style={deliveryEnabled
                ? { background: '#EFF6FF', border: '1px solid #93C5FD', color: '#1D4ED8', fontWeight: 700 }
                : { background: 'transparent', border: '1px solid #E2E8F0', color: '#64748B' }}
            >
              🚚 Delivery{deliveryEnabled ? ' ✓' : ''}
            </button>
          </div>

          {deliveryEnabled && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <input className="form-input" style={{ fontSize: '13px', padding: '6px 8px' }} placeholder="Deliver to (name)"
                value={deliveryAddress.name} onChange={e => setDeliveryAddress(a => ({ ...a, name: e.target.value }))} />
              <input className="form-input" style={{ fontSize: '13px', padding: '6px 8px' }} placeholder="Phone"
                value={deliveryAddress.phone} onChange={e => setDeliveryAddress(a => ({ ...a, phone: e.target.value }))} />
              <input className="form-input" style={{ fontSize: '13px', padding: '6px 8px', gridColumn: '1 / -1' }} placeholder="Delivery address *"
                value={deliveryAddress.address} onChange={e => setDeliveryAddress(a => ({ ...a, address: e.target.value }))} />
            </div>
          )}

          <div className="cart-items">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <FiShoppingCart className="empty-icon" />
                <p>Cart is empty</p>
                <span style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>Click any product to add</span>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={item.id} className="cart-item">
                  <div className="item-details">
                    <span className="item-name"><span className="item-index">{idx + 1}.</span> {item.name}</span>
                    <span className="item-price">{formatCurrency(item.price)}</span>
                    {item.dropship && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: '8px', width: 'fit-content' }}>
                        DROPSHIP
                      </span>
                    )}
                    {item.trackingType === 'serial' && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '8px', width: 'fit-content', cursor: 'pointer' }}
                        onClick={() => setSerialPicker({ product: item })}
                        title={(item.serials || []).join(', ')}>
                        SERIALS: {(item.serials || []).length} ✎
                      </span>
                    )}
                    {item.isComposite && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#0891B2', background: '#ECFEFF', padding: '1px 6px', borderRadius: '8px', width: 'fit-content' }}>
                        BUNDLE
                      </span>
                    )}
                    {!item.dropship && !item.isComposite && item.trackingType !== 'serial' && item.qty > item.stock && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '1px 6px', borderRadius: '8px', width: 'fit-content' }}>
                        BACKORDER ×{item.qty - Math.max(0, item.stock)}
                      </span>
                    )}
                  </div>
                  <div className="item-controls">
                    <button onClick={() => updateQty(item.id, -1)}><FiMinus /></button>
                    <span className="item-qty">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)}><FiPlus /></button>
                  </div>
                  <div className="item-total">
                    {formatCurrency(item.price * item.qty)}
                  </div>
                  <button className="remove-item-btn" onClick={() => removeFromCart(item.id)}>
                    <FiX />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="cart-customer">
            <select
              className="customer-select"
              value={selectedCustomer}
              onChange={e => setSelectedCustomer(e.target.value)}
            >
              {customers.map(c => (
                <option key={c._id || 'walkin'} value={c._id}>
                  {c.name}{c.phone ? ` (${c.phone})` : ''}{c.creditBlocked ? ' 🚫 BLOCKED' : ''}{c.outstandingCredit > 0 ? ` — Balance: ${c.outstandingCredit.toLocaleString()}` : ''}
                </option>
              ))}
            </select>
            {/* Credit block warning */}
            {(() => {
              const cust = customers.find(c => c._id === selectedCustomer); return cust?.creditBlocked ? (
                <div style={{ marginTop: '6px', padding: '7px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '12px', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiAlertTriangle /> Credit BLOCKED — admin must unblock this customer before new credit sales
                </div>
              ) : cust?.outstandingCredit > 0 ? (
                <div style={{ marginTop: '6px', padding: '7px 10px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                  ⚠️ Outstanding credit balance: <strong>{formatCurrency(cust.outstandingCredit)}</strong>
                </div>
              ) : null;
            })()}
            {priceList && (
              <div style={{ marginTop: '6px', padding: '7px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', fontSize: '12px', color: '#1D4ED8' }}>
                ★ Price list applied: <strong>{priceList.name}</strong>
                {priceList.type === 'percent' && ` (${priceList.percentage > 0 ? '+' : ''}${priceList.percentage}% on all items)`}
              </div>
            )}
            {customerIsExempt && (
              <div style={{ marginTop: '6px', padding: '7px 10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', fontSize: '12px', color: '#15803D', fontWeight: 700 }}>
                🏛 TAX EXEMPT — no tax on this sale
              </div>
            )}
          </div>

          <div className="cart-totals">
            {cart.length > 0 && (
              <div className="totals-row" style={{ fontWeight: 700 }}>
                <span>Items</span>
                <span>{cart.length} item{cart.length === 1 ? '' : 's'} / {cart.reduce((s, it) => s + (Number(it.qty) || 0), 0)} pcs</span>
              </div>
            )}
            <div className="totals-row">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="totals-row" style={{ color: '#16A34A' }}>
                <span>Discount</span>
                <span>-{formatCurrency(discountAmt)}</span>
              </div>
            )}
            <div className="totals-row">
              <span>Tax ({taxRatePercent}%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="totals-row" style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Discount ({getCurrencySymbol()})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                style={{ width: '80px', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--background)', color: 'var(--text)', fontSize: '13px', textAlign: 'right' }}
              />
            </div>
            <div className="totals-row grand-total">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="cart-actions">
            <div className="payment-methods" style={{ gridTemplateColumns: storeCreditAvailable > 0 ? 'repeat(5,1fr)' : 'repeat(4,1fr)', display: 'grid', gap: '8px' }}>
              <button
                type="button"
                className={`method-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('cash')}
                style={{ fontSize: '13px', padding: '10px 4px' }}
              >
                💵<br />Cash
              </button>
              <button
                type="button"
                className={`method-btn ${paymentMethod === 'pesapal' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('pesapal')}
                style={{ fontSize: '13px', padding: '10px 4px', borderColor: paymentMethod === 'pesapal' ? '#16A34A' : '', color: paymentMethod === 'pesapal' ? '#15803D' : '', background: paymentMethod === 'pesapal' ? '#F0FDF4' : '' }}
              >
                🇺🇬<br />Pesapal UG
              </button>
              <button
                type="button"
                className={`method-btn ${paymentMethod === 'credit' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('credit')}
                style={{ fontSize: '13px', padding: '10px 4px', borderColor: paymentMethod === 'credit' ? '#D97706' : '', color: paymentMethod === 'credit' ? '#92400E' : '', background: paymentMethod === 'credit' ? '#FFFBEB' : '' }}
              >
                📋<br />Credit
              </button>
              {storeCreditAvailable > 0 && (
                <button
                  type="button"
                  className={`method-btn ${paymentMethod === 'storeCredit' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('storeCredit')}
                  disabled={storeCreditAvailable < total}
                  title={storeCreditAvailable < total ? `Only ${formatCurrency(storeCreditAvailable)} available — not enough to cover this total` : undefined}
                  style={{ fontSize: '13px', padding: '10px 4px', borderColor: paymentMethod === 'storeCredit' ? '#1D4ED8' : '', color: paymentMethod === 'storeCredit' ? '#1D4ED8' : '', background: paymentMethod === 'storeCredit' ? '#EFF6FF' : '', opacity: storeCreditAvailable < total ? 0.5 : 1 }}
                >
                  🎟️<br />Store Credit
                </button>
              )}
              <button
                type="button"
                className={`method-btn ${paymentMethod === 'splitPay' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('splitPay')}
                style={{ fontSize: '13px', padding: '10px 4px', borderColor: paymentMethod === 'splitPay' ? '#7C3AED' : '', color: paymentMethod === 'splitPay' ? '#7C3AED' : '', background: paymentMethod === 'splitPay' ? '#F5F3FF' : '' }}
              >
                ➗<br />Split
              </button>
            </div>
            {paymentMethod === 'credit' && (
              <div style={{ marginTop: '6px', padding: '8px 10px', background: '#FFFBEB', fontSize: '12px' }}>
                Credit sale : customer must be selected above
              </div>
            )}
            {paymentMethod === 'storeCredit' && (
              <div style={{ marginTop: '6px', padding: '8px 10px', background: '#EFF6FF', fontSize: '12px', color: '#1D4ED8' }}>
                {formatCurrency(storeCreditAvailable)} available — this sale will be paid in full from store credit.
              </div>
            )}

            <div className="action-buttons">
              <button type="button" className="btn-hold" onClick={handleHold}>Hold</button>
              <button type="button" className="btn-pay" onClick={handlePayClick} disabled={cart.length === 0 || (paymentMethod === 'storeCredit' && processingPayment)}
                style={paymentMethod === 'credit' ? { background: 'linear-gradient(135deg, #D97706, #B45309)' } : paymentMethod === 'storeCredit' ? { background: 'linear-gradient(135deg, #1D4ED8, #1E40AF)' } : paymentMethod === 'splitPay' ? { background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' } : {}}
              >
                {paymentMethod === 'credit' ? `📋 Record Credit ${formatCurrency(total)}`
                  : paymentMethod === 'storeCredit' ? `🎟️ ${processingPayment ? 'Processing...' : `Pay ${formatCurrency(total)} with Credit`}`
                  : paymentMethod === 'splitPay' ? `➗ Split ${formatCurrency(total)}`
                  : `Pay ${formatCurrency(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cash Payment Modal */}
      {showCashModal && (
        <div className="modal-overlay">
          <div className="payment-modal">
            <div className="modal-header">
              <h2>Cash Payment</h2>
              <button onClick={() => setShowCashModal(false)}><FiX /></button>
            </div>
            <div className="modal-body">
              <div className="amount-due">
                <span>Amount Due</span>
                <h3>{formatCurrency(total)}</h3>
              </div>
              <div className="cash-input-group">
                <label>Cash Received ({getCurrencySymbol()})</label>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="quick-amounts">
                <button onClick={() => setCashReceived('5000')}>5K</button>
                <button onClick={() => setCashReceived('10000')}>10K</button>
                <button onClick={() => setCashReceived('20000')}>20K</button>
                <button onClick={() => setCashReceived('50000')}>50K</button>
                <button onClick={() => setCashReceived(String(Math.ceil(total)))}>Exact</button>
              </div>

              {parseFloat(cashReceived) >= total && (
                <div className="change-due">
                  <span>Change Due</span>
                  <h3 className="text-green">{formatCurrency(parseFloat(cashReceived) - total)}</h3>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCashModal(false)}>Cancel</button>
              <button
                className="btn-confirm"
                disabled={!cashReceived || parseFloat(cashReceived) < total || processingPayment}
                onClick={() => handleCompletePayment('Cash')}
              >
                {processingPayment ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Receipt Modal */}
      {showReceiptModal && completedOrder && (
        <div className="modal-overlay">
          <div className="payment-modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header" style={{ backgroundColor: '#F0FDF4' }}>
              <h2 style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FiCheckCircle /> Payment Complete
              </h2>
              <button onClick={() => setShowReceiptModal(false)}><FiX /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#64748B' }}>Order <strong>#{completedOrder.orderNumber}</strong> processed</p>

              <div style={{ backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px', padding: '16px', margin: '16px 0', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Date:</span>
                  <strong>{completedOrder.date}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Customer:</span>
                  <strong>{completedOrder.customerName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Payment Method:</span>
                  <strong>{completedOrder.paymentMethod}</strong>
                </div>
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '8px' }}>
                  {completedOrder.items.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span>{i + 1}. {item.name} x{item.qty}</span>
                      <span>{formatCurrency(item.price * item.qty)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#64748B', marginTop: '6px' }}>
                    <span>Total Items:</span>
                    <span>{completedOrder.items.length} item{completedOrder.items.length === 1 ? '' : 's'} / {completedOrder.items.reduce((s, it) => s + (Number(it.qty) || 0), 0)} pcs</span>
                  </div>
                </div>

                {/* Invoice total always shown */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px' }}>
                  <span>Invoice Total:</span>
                  <span>{formatCurrency(completedOrder.total)}</span>
                </div>

                {/* ── Credit / Partial Payment breakdown ── */}
                {completedOrder.paymentMethod === 'Credit Sale' ? (
                  <div style={{ marginTop: '10px', borderTop: '2px dashed #FCD34D', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                      <span>💵 Paid Now:</span>
                      <strong style={{ color: '#16A34A' }}>{formatCurrency(completedOrder.paymentDetails?.amountPaid || 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA', marginBottom: '6px' }}>
                      <span style={{ color: '#991B1B' }}>⚠️ Balance Still Owed:</span>
                      <span style={{ color: '#DC2626' }}>{formatCurrency(completedOrder.paymentDetails?.balanceDue ?? completedOrder.total)}</span>
                    </div>
                    {completedOrder.paymentDetails?.balanceDueDate && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#92400E', padding: '6px 10px', background: '#FFFBEB', borderRadius: '6px', border: '1px solid #FCD34D' }}>
                        <span>📅 Payment Due By:</span>
                        <strong>{new Date(completedOrder.paymentDetails.balanceDueDate).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid #16A34A', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '17px', color: '#16A34A' }}>
                    <span>✅ Total Paid:</span>
                    <span>{formatCurrency(completedOrder.total)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap', gap: '8px' }}>
              {completedOrder.paymentMethod === 'Cash' && (
                <button
                  className="btn-cancel"
                  onClick={openCashDrawer}
                  style={{ background: '#1E293B', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  🗄️ Open Drawer
                </button>
              )}
              <button className="btn-cancel" onClick={() => printThermalReceipt({
                ...completedOrder,
                cashierName: user?.name || 'Cashier',
                taxRate: taxRatePercent,
              })}>
                <FiPrinter /> Print Receipt
              </button>
              <button className="btn-confirm" onClick={() => setShowReceiptModal(false)}>
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Credit Sale Modal */}
      {showCreditModal && (
        <div className="modal-overlay">
          <div className="payment-modal">
            <div className="modal-header" style={{ background: '#FFFBEB' }}>
              <h2 style={{ color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>📋 Credit Sale</h2>
              <button onClick={() => setShowCreditModal(false)}><FiX /></button>
            </div>
            <div className="modal-body">
              <div className="amount-due">
                <span>Total Amount</span>
                <h3>{formatCurrency(total)}</h3>
              </div>
              <div className="cash-input-group">
                <label>Amount Paid Now ({getCurrencySymbol()}) — leave 0 if fully on credit</label>
                <input
                  type="number" min="0" step="100"
                  value={creditAmountPaid}
                  onChange={e => setCreditAmountPaid(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              {/* Live balance preview */}
              <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px', margin: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                  <span>Paid Now:</span>
                  <strong style={{ color: '#16A34A' }}>{formatCurrency(parseFloat(creditAmountPaid) || 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800 }}>
                  <span>Balance Due:</span>
                  <span style={{ color: '#DC2626' }}>{formatCurrency(Math.max(0, total - (parseFloat(creditAmountPaid) || 0)))}</span>
                </div>
              </div>
              <div className="cash-input-group">
                <label>Balance Due Date</label>
                <input
                  type="date"
                  value={creditDueDate}
                  onChange={e => setCreditDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--background)', color: 'var(--text)', fontSize: '14px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCreditModal(false)}>Cancel</button>
              <button className="btn-confirm" style={{ background: 'linear-gradient(135deg,#D97706,#B45309)' }} onClick={handleCreditConfirm} disabled={processingPayment}>
                {processingPayment ? 'Recording...' : '📋 Record Credit Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileModal && (
        <MobileMoneyModal
          provider={mobileProvider}
          amount={total}
          currency={mobileProvider === 'pesapal' ? 'UGX' : 'USD'}
          orderRef={orderNumber}
          onSuccess={handleMobileMoneySuccess}
          onClose={() => setShowMobileModal(false)}
        />
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Quick Create Customer Modal */}
      {showNewCustomer && (
        <QuickCreateCustomerModal
          onClose={() => setShowNewCustomer(false)}
          onCreated={(newCust) => {
            if (newCust) {
              setCustomers(prev => [...prev, newCust]);
              setSelectedCustomer(newCust._id);
            }
          }}
        />
      )}

      {/* Serial number picker for serial-tracked products */}
      {serialPicker && (
        <SerialPickerModal
          product={serialPicker.product}
          initialSelected={cart.find(i => i.id === serialPicker.product.id)?.serials || []}
          onClose={() => setSerialPicker(null)}
          onConfirm={(serials) => applySerialSelection(serialPicker.product, serials)}
        />
      )}

      {/* Weight entry for sold-by-weight products */}
      {weightPicker && (
        <WeightModal
          product={weightPicker.product}
          initialWeight={cart.find(i => i.id === weightPicker.product.id)?.qty || ''}
          onClose={() => setWeightPicker(null)}
          onConfirm={(weight) => applyWeight(weightPicker.product, weight)}
        />
      )}

      {/* Split tender */}
      {showSplitModal && (
        <SplitTenderModal
          total={total}
          onClose={() => setShowSplitModal(false)}
          onConfirm={handleSplitConfirm}
        />
      )}

      {/* Held bills (recall) */}
      {showHeldModal && (
        <HeldBillsModal
          onClose={() => setShowHeldModal(false)}
          onRecall={handleRecall}
        />
      )}

      {/* Reprint recent bills */}
      {showReprintModal && (
        <ReprintModal onClose={() => setShowReprintModal(false)} />
      )}

      {/* Shift / drawer session */}
      {showShiftModal && (
        <ShiftModal
          shift={currentShift}
          onChanged={setCurrentShift}
          onClose={() => setShowShiftModal(false)}
        />
      )}
    </div>
  );
};

export default POSTerminal;
