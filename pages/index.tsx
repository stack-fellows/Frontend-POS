import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  ShoppingCart, User, CheckCircle, Check, AlertTriangle,
  Printer, CreditCard, Banknote, RefreshCw, Award, Edit,
  Lock, Gift, ChevronRight, Settings, X, BarChart2,
  TrendingUp, Package, Users, Sun, Moon, ChevronDown,
  ArrowRight, Delete, LogOut, Calendar, Trash2, Download
} from 'lucide-react';
import ModifiersModal from '../components/ModifiersModal';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface CartItem {
  id: string;
  productName: string;
  variantId: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  modifiers: { id: string; name: string; price: number }[];
  isComplimentary?: boolean;
  discount?: { type: 'PERCENT' | 'FIXED'; value: number; name: string };
}

type AdminTab = 'shift' | 'day' | 'daily-report' | 'item-report' | 'shift-report' | 'settings';
type AppScreen = 'DAY_CLOSED' | 'SHIFT_LOGIN' | 'POS';

// ─────────────────────────────────────────────────────────────────────────────
// PIE CHART COMPONENT (canvas-based, no library)
// ─────────────────────────────────────────────────────────────────────────────
const PieChart: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({
  data, size = 160
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    const cx = size / 2, cy = size / 2, r = size / 2 - 8;
    ctx.clearRect(0, 0, size, size);

    let startAngle = -Math.PI / 2;
    for (const slice of data) {
      if (slice.value <= 0) continue;
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      ctx.strokeStyle = '#1a1d23';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += sliceAngle;
    }

    // Center hole (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, 2 * Math.PI);
    ctx.fillStyle = '#12151b';
    ctx.fill();
  }, [data, size]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-5">
      <canvas ref={canvasRef} width={size} height={size} />
      <div className="space-y-1.5 flex-1">
        {data.filter(d => d.value > 0).map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-surface-500 flex-1">{d.label}</span>
            <span className="font-semibold text-surface-600">{total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
            <span className="text-surface-400">{d.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function POSBilling() {
  const router = useRouter();
  const [settings, setSettings] = useState<any>({
    isMaster: true, masterIp: '127.0.0.1', branchId: 'BR01', terminalId: 'T01', cloudUrl: 'http://localhost:5000', employees: []
  });
  const [staffList, setStaffList] = useState<any[]>([]);
  const waitersList = useMemo(() => {
    return staffList
      .filter((emp: any) => emp.role.toLowerCase() === 'waiter' && emp.status === 'ACTIVE')
      .map((emp: any) => emp.name);
  }, [staffList]);
  const [apiUrl, setApiUrl] = useState('http://localhost:4000');

  // Core app state
  const [activeBusinessDay, setActiveBusinessDay] = useState<any>(null);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [screen, setScreen] = useState<AppScreen>('DAY_CLOSED');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [appVersion, setAppVersion] = useState('');
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    setTheme('light');
    localStorage.setItem('pos-theme', 'light');
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);


  // POS state
  const [products, setProducts] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<{ name: string, status: string, imageUrl?: string, bgColor?: string, textColor?: string }[]>([]);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBulkItemIds, setSelectedBulkItemIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'POS' | 'KDS' | 'PAID_ORDERS' | 'ADMIN'>('POS');
  const [paidOrders, setPaidOrders] = useState<any[]>([]);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeToReturn, setChangeToReturn] = useState(0);
  const [skipPrintReceipt, setSkipPrintReceipt] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isUpdateDetailsOpen, setIsUpdateDetailsOpen] = useState(false);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY'>('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [waiterInfo, setWaiterInfo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPlatform, setDeliveryPlatform] = useState('FOODPANDA');
  const [orderError, setOrderError] = useState('');
  const [tempOrderType, setTempOrderType] = useState<'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY'>('DINE_IN');
  const [tempTableNumber, setTempTableNumber] = useState('');
  const [tempWaiterInfo, setTempWaiterInfo] = useState('');
  const [tempCustomerName, setTempCustomerName] = useState('');
  const [tempCustomerPhone, setTempCustomerPhone] = useState('');
  const [tempDeliveryAddress, setTempDeliveryAddress] = useState('');
  const [tempDeliveryPlatform, setTempDeliveryPlatform] = useState('FOODPANDA');
  const [tempOrderError, setTempOrderError] = useState('');
  const [printToast, setPrintToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null);
  const showUiToast = (msg: string, type: 'info' | 'success' | 'error' = 'error') => {
    setPrintToast({ msg, type });
    setTimeout(() => setPrintToast(null), 4000);
  };
  const [discount, setDiscount] = useState<{ type: 'PERCENT' | 'FIXED' | 'NONE'; value: number; name: string }>({ type: 'NONE', value: 0, name: '' });
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [discountFlowStep, setDiscountFlowStep] = useState<'CHOOSE' | 'INDIVIDUAL' | 'FULL'>('CHOOSE');
  const [selectedIndividualItemIds, setSelectedIndividualItemIds] = useState<string[]>([]);
  const [customDiscountType, setCustomDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [customDiscountValue, setCustomDiscountValue] = useState('');
  const [customDiscountName, setCustomDiscountName] = useState('');
  const [kdsOrders, setKdsOrders] = useState<any[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState(0);
  const [lowStockWarnings, setLowStockWarnings] = useState<string[]>([]);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [originalOrder, setOriginalOrder] = useState<any>(null);
  const [isCartDirty, setIsCartDirty] = useState(false);
  const [sortField, setSortField] = useState<'createdAt' | 'orderType' | 'paymentMethod' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY'>('ALL');
  const wsRef = useRef<WebSocket | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ status: 'downloading' | 'ready'; progress?: number } | null>(null);

  // ── Login screen state ────────────────────────────────────────
  const [loginPin, setLoginPin] = useState('');
  const [loginEmployee, setLoginEmployee] = useState<{ name: string; role: string } | null>(null);
  const [loginStep, setLoginStep] = useState<'PIN' | 'CASH'>('PIN');
  const [loginOpeningBalance, setLoginOpeningBalance] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loggedInEmployee, setLoggedInEmployee] = useState<{ pin: string; name: string; role: string } | null>(null);
  const [adminOpeningBalance, setAdminOpeningBalance] = useState('');

  // ── Admin panel state ─────────────────────────────────────────
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('shift');
  const [closingCash, setClosingCash] = useState('');
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [isHandover, setIsHandover] = useState(false); // true = handover (don't close day), false = end shift
  // Report data
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [itemReport, setItemReport] = useState<any[]>([]);
  const [shiftReport, setShiftReport] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Admin Auth States
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authReasonRequired, setAuthReasonRequired] = useState(false);
  const [authReason, setAuthReason] = useState('');
  const [authCallback, setAuthCallback] = useState<((reason?: string) => void) | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);

  const triggerAdminAuth = (callback: (reason?: string) => void, requireReason: boolean = false) => {
    setAuthPin('');
    setAuthError('');
    setAuthReason('');
    setAuthReasonRequired(requireReason);
    setAuthCallback(() => callback);
    setIsAuthModalOpen(true);
  };

  const handleAuthDigit = (digit: string) => {
    if (authPin.length < 4) {
      const nextPin = authPin + digit;
      setAuthPin(nextPin);
      if (nextPin.length === 4) {
        if (authReasonRequired && !authReason.trim()) {
          setAuthError('Please enter a reason first.');
          setAuthPin('');
          return;
        }
        const isManager = settings.employees?.some((emp: any) => emp.pin === nextPin && emp.role === 'MANAGER');
        if (isManager) {
          setIsAuthModalOpen(false);
          if (authCallback) {
            authCallback(authReasonRequired ? authReason.trim() : undefined);
          }
        } else {
          setAuthError('Invalid Admin/Manager PIN.');
          setAuthPin('');
        }
      }
    }
  };

  const handleAuthDelete = () => {
    setAuthPin(authPin.slice(0, -1));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // INIT & DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      let resolvedApiUrl = 'http://localhost:4000';
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const s = await (window as any).electronAPI.getSettings();
        setSettings(s);
        resolvedApiUrl = s.isMaster ? 'http://localhost:4000' : `http://${s.masterIp}:4000`;
        setApiUrl(resolvedApiUrl);
        const v = await (window as any).electronAPI.getAppVersion();
        setAppVersion(v || '1.0.0');
      } else {
        const mockLogo = localStorage.getItem('test-printerLogoBase64') || '';
        setSettings({ printerLogoBase64: mockLogo } as any);
      }
      await loadInitialState(resolvedApiUrl);
    }
    init();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.onUpdateAvailable(() => {
        showUiToast('A new update is downloading...', 'info');
      });
      (window as any).electronAPI.onUpdateProgress((progressObj: any) => {
        setUpdateStatus({ status: 'downloading', progress: progressObj.percent });
      });
      (window as any).electronAPI.onUpdateDownloaded(() => {
        setUpdateStatus({ status: 'ready' });
        setShowUpdateModal(true);
      });
      (window as any).electronAPI.onUpdateError((err: string) => {
        showUiToast(`Update Error: ${err}`, 'error');
      });
    }
  }, []);

  useEffect(() => {
    if (screen !== 'SHIFT_LOGIN') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        handlePinDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [screen, loginPin, loginLoading]);

  const loadInitialState = async (url: string) => {
    try {
      // Check business day from DB
      const dayRes = await fetch(`${url}/api/business-day/active`);
      if (dayRes.ok) {
        const day = await dayRes.json();
        setActiveBusinessDay(day);
        if (day) {
          // Check active shift
          const shiftRes = await fetch(`${url}/api/shifts/active`);
          if (shiftRes.ok) {
            const shift = await shiftRes.json();
            setActiveShift(shift);
            if (shift) {
              fetchAllPosData(url);
              setupWebSocket(url);
            }
          }
        }
      }
    } catch (err) {
      console.error('Init error:', err);
    }
    setScreen('SHIFT_LOGIN');
  };

  const fetchAllPosData = (url?: string) => {
    const u = url || apiUrl;
    fetchCatalog(u);
    fetchKdsOrders(u);
    fetchInventory(u);
    fetchSyncStatus(u);
    fetchUnpaidOrders(u);
    fetchActiveShift(u);
    fetchActiveBusinessDay(u);
  };

  const fetchCatalog = async (url?: string) => {
    const u = url || apiUrl;
    try {
      const [pr, mr, cr, sr] = await Promise.all([
        fetch(`${u}/api/products`),
        fetch(`${u}/api/modifiers`),
        fetch(`${u}/api/settings/categories`),
        fetch(`${u}/api/settings/staff`)
      ]);
      if (pr.ok) setProducts(await pr.json());
      if (mr.ok) setModifierGroups(await mr.json());
      if (cr.ok) setCategoriesList(await cr.json());
      if (sr.ok) setStaffList(await sr.json());
    } catch (err) { console.error(err); }
  };

  const fetchKdsOrders = async (url?: string) => {
    const u = url || apiUrl;
    try { const r = await fetch(`${u}/api/orders`); if (r.ok) setKdsOrders(await r.json()); } catch (e) { console.error(e); }
  };
  const fetchInventory = async (url?: string) => {
    const u = url || apiUrl;
    try { const r = await fetch(`${u}/api/inventory`); if (r.ok) setInventoryList(await r.json()); } catch (e) { console.error(e); }
  };
  const fetchSyncStatus = async (url?: string) => {
    const u = url || apiUrl;
    try { const r = await fetch(`${u}/api/sync/status`); if (r.ok) { const d = await r.json(); setSyncStatus(d.pendingCount); } } catch (e) { console.error(e); }
  };
  const fetchUnpaidOrders = async (url?: string) => {
    const u = url || apiUrl;
    try { const r = await fetch(`${u}/api/orders/unpaid`); if (r.ok) setUnpaidOrders(await r.json()); } catch (e) { console.error(e); }
  };
  const fetchPaidOrders = async () => {
    try { const r = await fetch(`${apiUrl}/api/orders/paid`); if (r.ok) setPaidOrders(await r.json()); } catch (e) { console.error(e); }
  };

  const fetchActiveShift = async (url?: string) => {
    const u = url || apiUrl;
    try {
      const r = await fetch(`${u}/api/shifts/active`);
      if (r.ok) {
        const shift = await r.json();
        setActiveShift(shift);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchActiveBusinessDay = async (url?: string) => {
    const u = url || apiUrl;
    try {
      const r = await fetch(`${u}/api/business-day/active`);
      if (r.ok) {
        const day = await r.json();
        setActiveBusinessDay(day);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { if (activeTab === 'PAID_ORDERS') fetchPaidOrders(); }, [activeTab]);

  const setupWebSocket = (url?: string) => {
    const u = url || apiUrl;
    if (wsRef.current) wsRef.current.close();
    const wsUrl = `${u.replace('http', 'ws')}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (['NEW_ORDER', 'ORDER_UPDATED'].includes(d.type)) { fetchAllPosData(); }
        else if (d.type === 'LOW_STOCK_WARNING') setLowStockWarnings(d.ingredients);
      } catch (err) { console.error(err); }
    };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // BUSINESS DAY HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleStartBusinessDay = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/business-day/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) {
        const day = await res.json();
        setActiveBusinessDay(day);
        setScreen('POS');
        setLoginStep('PIN');
        setLoginPin('');
        setLoginEmployee(null);
        setLoginError('');
      } else {
        const err = await res.json();
        showUiToast(err.error || 'Failed to start business day.', 'error');
      }
    } catch { showUiToast('Error connecting to server.', 'error'); }
  };

  const handleCloseBusinessDay = async () => {
    if (!activeBusinessDay) return;
    try {
      const res = await fetch(`${apiUrl}/api/business-day/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDayId: activeBusinessDay.id }),
      });
      if (res.ok) {
        setActiveBusinessDay(null);
        setActiveShift(null);
        setCart([]);
        setEditingOrderId(null);
        setUnpaidOrders([]);
        setActiveTab('POS');
        setScreen('SHIFT_LOGIN');
      } else {
        const err = await res.json();
        showUiToast(err.error, 'error');
      }
    } catch { showUiToast('Error closing business day.', 'error'); }
  };

  const handleCashDigit = (digit: string) => {
    setCashReceived(prev => {
      if (digit === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      if (prev.includes('.')) {
        const parts = prev.split('.');
        if (parts[1].length >= 2) return prev;
      }
      return prev + digit;
    });
  };

  const handleCashDelete = () => {
    setCashReceived(prev => prev.slice(0, -1));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN (PIN-ONLY) HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handlePinDigit = (d: string) => {
    if (loginLoading) return;          // prevent double-submission while verifying
    if (loginPin.length >= 4) return;
    const newPin = loginPin + d;
    setLoginPin(newPin);
    setLoginError('');
    if (newPin.length === 4) verifyPin(newPin);
  };

  const handlePinDelete = () => {
    setLoginPin(p => p.slice(0, -1));
    setLoginError('');
    setLoginEmployee(null);
  };

  const verifyPin = async (pin: string) => {
    setLoginLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8 s timeout
    try {
      const res = await fetch(`${apiUrl}/api/employees/verify-pin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const emp = await res.json();
        if (emp.role === 'MANAGER') {
          setLoginPin('');
          setLoginError('');
          setLoginLoading(false);
          router.push({ pathname: '/admin', query: { pin: pin } });
          return;
        }
        setLoggedInEmployee({ pin, name: emp.name, role: emp.role });
        setScreen('POS');
        setLoginPin('');
        setLoginError('');
        fetchAllPosData();
        setupWebSocket();
      } else {
        setLoginError('Invalid PIN. Please try again.');
        setLoginPin('');
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        setLoginError('Server timeout. Please try again.');
      } else {
        setLoginError('Connection error. Is the server running?');
      }
      setLoginPin('');
    } finally { setLoginLoading(false); }
  };

  const handleOpenShift = async () => {
    if (!activeBusinessDay || !loginEmployee) return;
    const bal = parseFloat(loginOpeningBalance) || 0;
    setLoginLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${apiUrl}/api/shifts/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeePin: loginPin, openingBalance: bal, businessDayId: activeBusinessDay.id }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const shift = await res.json();
        setActiveShift(shift);
        setScreen('POS');
        setLoginPin('');
        setLoginEmployee(null);
        setLoginStep('PIN');
        setLoginOpeningBalance('');
        fetchAllPosData();
        setupWebSocket();
      } else {
        const err = await res.json();
        showUiToast(err.error || 'Failed to open shift.', 'error');
      }
    } catch (err: any) {
      clearTimeout(timer);
      showUiToast(err?.name === 'AbortError' ? 'Server timeout. Please try again.' : 'Error opening shift.', 'error');
    } finally { setLoginLoading(false); }
  };

  const handleOpenShiftFromAdmin = async () => {
    if (!activeBusinessDay || !loggedInEmployee) return;
    const bal = parseFloat(adminOpeningBalance) || 0;
    setLoginLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${apiUrl}/api/shifts/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeePin: loggedInEmployee.pin, openingBalance: bal, businessDayId: activeBusinessDay.id }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const shift = await res.json();
        setActiveShift(shift);
        setAdminOpeningBalance('');
        fetchAllPosData();
        setupWebSocket();
      } else {
        const err = await res.json();
        showUiToast(err.error || 'Failed to open shift.', 'error');
      }
    } catch (err: any) {
      clearTimeout(timer);
      showUiToast(err?.name === 'AbortError' ? 'Server timeout. Please try again.' : 'Error opening shift.', 'error');
    } finally { setLoginLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHIFT CLOSE & HANDOVER HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingCash || !activeShift) return;
    try {
      const res = await fetch(`${apiUrl}/api/shifts/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: activeShift.id, actualCash: parseFloat(closingCash) }),
      });
      if (res.ok) {
        setClosingCash('');
        setIsClosingShift(false);
        setActiveShift(null);
        setCart([]);
        setEditingOrderId(null);
        setUnpaidOrders([]);
        setActiveTab('POS');

        setLoggedInEmployee(null);
        setScreen('SHIFT_LOGIN');
        setLoginStep('PIN');
        setLoginPin('');
        setLoginEmployee(null);
        setLoginError('');
        setIsHandover(false);
      } else { showUiToast('Failed to close shift.', 'error'); }
    } catch { showUiToast('Error closing shift.', 'error'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // REPORT FETCHING
  // ─────────────────────────────────────────────────────────────────────────
  const fetchDailyReport = useCallback(async () => {
    if (!activeBusinessDay) return;
    setReportLoading(true);
    try {
      const r = await fetch(`${apiUrl}/api/reports/daily?businessDayId=${activeBusinessDay.id}`);
      if (r.ok) setDailyReport(await r.json());
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  }, [apiUrl, activeBusinessDay]);

  const fetchItemReport = useCallback(async () => {
    if (!activeBusinessDay) return;
    setReportLoading(true);
    try {
      const r = await fetch(`${apiUrl}/api/reports/items?businessDayId=${activeBusinessDay.id}`);
      if (r.ok) setItemReport(await r.json());
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  }, [apiUrl, activeBusinessDay]);

  const fetchShiftReport = useCallback(async () => {
    if (!activeBusinessDay) return;
    setReportLoading(true);
    try {
      const r = await fetch(`${apiUrl}/api/reports/shifts?businessDayId=${activeBusinessDay.id}`);
      if (r.ok) setShiftReport(await r.json());
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  }, [apiUrl, activeBusinessDay]);

  useEffect(() => {
    if (activeTab === 'ADMIN') {
      if (adminTab === 'daily-report') fetchDailyReport();
      if (adminTab === 'item-report') fetchItemReport();
      if (adminTab === 'shift-report') fetchShiftReport();
    }
  }, [activeTab, adminTab, fetchDailyReport, fetchItemReport, fetchShiftReport]);

  // ─────────────────────────────────────────────────────────────────────────
  // HISTORY SORTING
  // ─────────────────────────────────────────────────────────────────────────
  const processedPaidOrders = React.useMemo(() => {
    let list = [...paidOrders];
    if (channelFilter !== 'ALL') list = list.filter(o => o.orderType === channelFilter);
    if (sortField && sortDirection) {
      list.sort((a, b) => {
        if (sortField === 'orderType') {
          const m: Record<string, number> = { 'DINE_IN': 1, 'TAKE_AWAY': 2, 'DELIVERY': 3 };
          return sortDirection === 'asc' ? (m[a[sortField]] || 99) - (m[b[sortField]] || 99) : (m[b[sortField]] || 99) - (m[a[sortField]] || 99);
        }
        if (sortField === 'paymentMethod') {
          const m: Record<string, number> = { 'CASH': 1, 'CARD': 2, 'PENDING': 3 };
          return sortDirection === 'asc' ? (m[a[sortField]] || 99) - (m[b[sortField]] || 99) : (m[b[sortField]] || 99) - (m[a[sortField]] || 99);
        }
        if (sortField === 'createdAt') {
          const ta = new Date(a[sortField]).getTime(), tb = new Date(b[sortField]).getTime();
          return sortDirection === 'asc' ? ta - tb : tb - ta;
        }
        return 0;
      });
    }
    return list;
  }, [paidOrders, sortField, sortDirection, channelFilter]);

  const handleSortPlacedAt = () => { setSortField('createdAt'); setSortDirection(p => sortField !== 'createdAt' ? 'asc' : p === 'asc' ? 'desc' : null); if (sortField !== 'createdAt') { } };
  const cycleSort = (field: typeof sortField) => {
    if (sortField !== field) { setSortField(field); setSortDirection('asc'); }
    else if (sortDirection === 'asc') setSortDirection('desc');
    else { setSortField(null); setSortDirection(null); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CART MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  const handleNewOrder = () => {
    setEditingOrderId(null); setOriginalOrder(null); setCart([]);
    setOrderType('DINE_IN'); setTableNumber(''); setWaiterInfo('');
    setCustomerName(''); setCustomerPhone(''); setDeliveryAddress(''); setDeliveryPlatform('FOODPANDA');
    setDiscount({ type: 'NONE', value: 0, name: '' }); setSelectedCartItemId(null);
    setIsCartDirty(false); setSkipPrintReceipt(false);
  };

  const handleLoadOrder = (order: any) => {
    setEditingOrderId(order.id); setOriginalOrder(order);
    setOrderType(order.orderType || 'DINE_IN'); setTableNumber(order.tableNumber || '');
    setWaiterInfo(order.waiterInfo || ''); setCustomerName(order.customerName || '');
    setCustomerPhone(order.customerPhone || ''); setDeliveryAddress(order.deliveryAddress || '');
    setDeliveryPlatform(order.deliveryPlatform || 'FOODPANDA');
    setSelectedCartItemId(null); setIsCartDirty(false);
    const loadedCart: CartItem[] = order.items.map((item: any) => {
      const isComp = Number(item.unitPrice) === 0;
      let catalogPrice = Number(item.unitPrice);
      for (const p of products) {
        const v = p.variants?.find((vi: any) => vi.id === item.productVariantId);
        if (v) { catalogPrice = Number(v.price); break; }
      }
      let itemDiscount: any = undefined;
      let finalUnitPrice = Number(item.unitPrice);
      if (!isComp && catalogPrice > Number(item.unitPrice) + 0.01) {
        itemDiscount = { type: 'FIXED', value: (catalogPrice - Number(item.unitPrice)) * item.quantity, name: 'Item Discount' };
        finalUnitPrice = catalogPrice;
      }
      return {
        id: item.id, productName: item.productVariant.product.name,
        variantId: item.productVariantId, variantName: item.productVariant.name,
        unitPrice: isComp ? catalogPrice : finalUnitPrice, quantity: item.quantity,
        modifiers: (item.modifiers || []).map((m: any) => ({ id: m.modifier.id, name: m.modifier.name, price: Number(m.modifier.price || 0) })),
        isComplimentary: isComp, discount: itemDiscount
      };
    });
    setCart(loadedCart);
    let itemSub = 0;
    loadedCart.forEach(item => {
      let cost = item.isComplimentary ? 0 : item.unitPrice;
      if (!item.isComplimentary) item.modifiers.forEach(m => cost += m.price);
      let t = cost * item.quantity;
      if (item.discount && !item.isComplimentary) {
        const da = item.discount.type === 'PERCENT' ? t * (item.discount.value / 100) : Math.min(t, item.discount.value);
        t -= da;
      }
      itemSub += t;
    });
    const diff = itemSub - Number(order.subtotal);
    if (diff > 0.01) setDiscount({ type: 'FIXED', value: diff, name: 'Applied Discount' });
    else setDiscount({ type: 'NONE', value: 0, name: '' });
  };

  const handleProductClick = (product: any) => {
    const v = product.variants?.[0];
    if (!v) return;
    const idx = cart.findIndex(i => i.variantId === v.id);
    if (idx > -1) { const c = [...cart]; c[idx].quantity += 1; setCart(c); }
    else setCart([...cart, { id: `${Date.now()}-${Math.random()}`, productName: product.name, variantId: v.id, variantName: v.name, unitPrice: Number(v.price), quantity: 1, modifiers: [] }]);
    setIsCartDirty(true);
  };

  const handleAddToCart = (variant: any, selectedModifiers: any[]) => {
    setCart([...cart, { id: `${Date.now()}-${Math.random()}`, productName: selectedProduct.name, variantId: variant.id, variantName: variant.name, unitPrice: variant.price, quantity: 1, modifiers: selectedModifiers.map(m => ({ id: m.id, name: m.name, price: m.price })) }]);
    setSelectedProduct(null);
    setIsCartDirty(true);
  };

  const handleBulkDelete = (reason?: string | React.MouseEvent) => {
    if (selectedBulkItemIds.length === 0) return;
    
    if (editingOrderId) {
      const itemsToDelete = cart.filter(i => selectedBulkItemIds.includes(i.id));
      const authReason = typeof reason === 'string' ? reason : 'N/A';
      itemsToDelete.forEach(item => {
        fetch(`${apiUrl}/api/settings/deletions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber: originalOrder?.orderNumber || 'Unknown',
            itemName: `${item.productName} (${item.variantName})`,
            reason: authReason,
            authorizedBy: 'Manager',
            cashierName: activeShift?.employeeName || 'Staff'
          })
        }).catch(err => console.error('Failed to log bulk item deletion:', err));
      });
    }

    setCart(cart.filter(i => !selectedBulkItemIds.includes(i.id)));
    if (selectedCartItemId && selectedBulkItemIds.includes(selectedCartItemId)) {
      setSelectedCartItemId(null);
    }
    setSelectedBulkItemIds([]);
    setIsCartDirty(true);
  };

  const handleRemoveFromCart = (id: string) => {
    const existingItem = cart.find(i => i.id === id);
    if (!existingItem) return;
    if (existingItem.quantity > 1) {
      setCart(cart.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i));
    } else {
      setCart(cart.filter(i => i.id !== id));
      if (selectedCartItemId === id) setSelectedCartItemId(null);
    }
    setIsCartDirty(true);
  };

  const getCartTotals = () => {
    let rawSubtotal = 0; let itemDiscountsSum = 0;
    cart.forEach(item => {
      let cost = item.isComplimentary ? 0 : item.unitPrice;
      if (!item.isComplimentary) item.modifiers.forEach(m => cost += m.price);
      let t = cost * item.quantity;
      if (item.discount && !item.isComplimentary) {
        const da = item.discount.type === 'PERCENT' ? t * (item.discount.value / 100) : Math.min(t, item.discount.value);
        itemDiscountsSum += da; t -= da;
      }
      rawSubtotal += t;
    });
    let discountAmount = 0;
    if (discount.type === 'PERCENT') discountAmount = rawSubtotal * (discount.value / 100);
    else if (discount.type === 'FIXED') discountAmount = Math.min(rawSubtotal, discount.value);
    const subtotal = Math.max(0, rawSubtotal - discountAmount);
    const isTaxEnabled = settings?.taxEnabled ?? true;
    const taxPercentage = settings?.taxRate ?? 10;
    const tax = isTaxEnabled ? subtotal * (taxPercentage / 100) : 0;
    return { rawSubtotal, discountAmount: discountAmount + itemDiscountsSum, subtotal, tax, total: subtotal + tax, orderDiscountAmount: discountAmount, itemDiscountsSum };
  };

  const checkDiscountValid = (target: string, type: 'PERCENT' | 'FIXED' | 'NONE', value: number): boolean => {
    if (type === 'NONE') return true;
    if (target === 'order') {
      let sub = 0;
      cart.forEach(item => {
        let cost = item.isComplimentary ? 0 : item.unitPrice;
        if (!item.isComplimentary) item.modifiers.forEach(m => cost += m.price);
        let t = cost * item.quantity;
        if (item.discount && !item.isComplimentary) { const da = item.discount.type === 'PERCENT' ? t * (item.discount.value / 100) : Math.min(t, item.discount.value); t -= da; }
        sub += t;
      });
      if (sub === 0) { showUiToast('Please add items first.', 'error'); return false; }
      const da = type === 'PERCENT' ? sub * (value / 100) : value;
      if (da >= sub) { showUiToast(`Discount (${da.toFixed(2)}) must be less than subtotal (${sub.toFixed(2)}).`, 'error'); return false; }
    } else {
      const item = cart.find(c => c.id === target);
      if (!item) return false;
      let cost = item.isComplimentary ? 0 : item.unitPrice;
      if (!item.isComplimentary) item.modifiers.forEach(m => cost += m.price);
      const t = cost * item.quantity;
      if (t === 0) { showUiToast('Cannot discount a free item.', 'error'); return false; }
      const da = type === 'PERCENT' ? t * (value / 100) : value;
      if (da >= t) { showUiToast(`Discount (${da.toFixed(2)}) must be less than item total (${t.toFixed(2)}).`, 'error'); return false; }
    }
    return true;
  };

  const handleApplyDiscount = (type: 'PERCENT' | 'FIXED' | 'NONE', value: number, name: string) => {
    if (discountFlowStep === 'FULL') {
      if (type === 'NONE') setDiscount({ type: 'NONE', value: 0, name: '' });
      else if (checkDiscountValid('order', type, value)) setDiscount({ type, value, name });
      else return;
    } else {
      if (selectedIndividualItemIds.length === 0) { showUiToast('Please select at least one item.', 'error'); return; }
      if (type === 'NONE') {
        setCart(cart.map(c => selectedIndividualItemIds.includes(c.id) ? (({ discount: _, ...rest }) => rest)(c) : c));
      } else {
        if (selectedIndividualItemIds.some(id => !checkDiscountValid(id, type, value))) return;
        setCart(cart.map(c => selectedIndividualItemIds.includes(c.id) ? { ...c, discount: { type: type as 'PERCENT' | 'FIXED', value, name } } : c));
      }
    }
    setIsDiscountOpen(false);
    setIsCartDirty(true);
  };

  const isTargetDiscountActive = (name: string) =>
    discountFlowStep === 'FULL' ? discount.name === name
      : selectedIndividualItemIds.length > 0 && selectedIndividualItemIds.every(id => cart.find(c => c.id === id)?.discount?.name === name);

  const isTargetDiscountNone = () =>
    discountFlowStep === 'FULL' ? discount.type === 'NONE'
      : selectedIndividualItemIds.length === 0 || selectedIndividualItemIds.every(id => !cart.find(c => c.id === id)?.discount);

  const handleVoidBill = () => {
    setVoidConfirmOpen(true);
  };

  const confirmVoidBill = async () => {
    setVoidConfirmOpen(false);

    if (!editingOrderId) {
      handleNewOrder();
      showUiToast('Bill voided successfully.', 'success');
      return;
    }

    setIsSubmitting(true);
    try {
      const voidedCart = cart.map(item => ({ ...item, isComplimentary: true }));
      const res = await fetch(`${apiUrl}/api/orders/${editingOrderId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: settings?.branchId, terminalId: settings?.terminalId,
          paymentMethod: 'VOID',
          paymentStatus: 'PAID',
          status: 'CANCELLED',
          subtotal: 0, tax: 0, total: 0,
          employeeId: activeShift?.employeePin, shiftId: activeShift?.id,
          items: buildOrderItems(voidedCart), memberId: null,
          orderType, tableNumber: tableNumber || null,
          waiterInfo, customerName: orderType === 'DELIVERY' ? customerName : null,
          customerPhone: orderType === 'DELIVERY' ? customerPhone : null,
          deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : null,
          deliveryPlatform: orderType === 'DELIVERY' ? deliveryPlatform : null
        })
      });

      if (res.ok) {
        handleNewOrder();
        fetchAllPosData();
        showUiToast('Bill voided successfully.', 'success');
      } else {
        const err = await res.json();
        showUiToast(err.error || 'Failed to void bill', 'error');
      }
    } catch {
      showUiToast('Network error while voiding bill.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplimentary = () => {
    if (!selectedCartItemId) return;
    setCart(cart.map(item => item.id === selectedCartItemId ? { ...item, isComplimentary: !item.isComplimentary } : item));
    setIsCartDirty(true);
  };

  const handleSaveDetails = () => {
    setTempOrderError('');
    if (tempOrderType === 'DELIVERY') {
      if (!tempCustomerName.trim()) { setTempOrderError('Enter Customer Name.'); return; }
      if (!tempCustomerPhone.trim()) { setTempOrderError('Enter Phone Number.'); return; }
      if (!tempDeliveryAddress.trim()) { setTempOrderError('Enter Delivery Address.'); return; }
    } else {
      // Table # is optional for all channels
      if (!tempWaiterInfo) { setTempOrderError('Select a Waiter.'); return; }
    }
    setOrderType(tempOrderType);
    setTableNumber(tempTableNumber);
    setWaiterInfo(tempOrderType !== 'DELIVERY' ? tempWaiterInfo : '');
    setCustomerName(tempOrderType === 'DELIVERY' ? tempCustomerName : '');
    setCustomerPhone(tempOrderType === 'DELIVERY' ? tempCustomerPhone : '');
    setDeliveryAddress(tempOrderType === 'DELIVERY' ? tempDeliveryAddress : '');
    setDeliveryPlatform(tempOrderType === 'DELIVERY' ? tempDeliveryPlatform : 'FOODPANDA');
    setIsUpdateDetailsOpen(false);
    setIsCartDirty(true);
  };

  const buildOrderItems = (cartItems: CartItem[]) => cartItems.map(item => {
    let da = 0;
    if (item.discount && !item.isComplimentary) {
      let cost = item.unitPrice; item.modifiers.forEach(m => cost += m.price);
      const t = cost * item.quantity;
      da = item.discount.type === 'PERCENT' ? t * (item.discount.value / 100) : Math.min(t, item.discount.value);
    }
    return {
      productVariantId: item.variantId, quantity: item.quantity,
      unitPrice: item.isComplimentary ? 0 : (item.discount ? Math.max(0, item.unitPrice - da / item.quantity) : item.unitPrice),
      modifiers: item.modifiers.map(m => m.id)
    };
  });

  const showBrowserPreview = (data: any, logoBase64?: string) => {
    const formatDate = (dateInput: Date | string | number) => {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      let hours = d.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hours)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt Preview - ${data.orderNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500&display=swap');
    @page { margin: 0; }
    body {
      font-family: 'Outfit', 'Segoe UI', sans-serif;
      margin: 0 auto; padding: 20px; width: 100%; max-width: 80mm;
      box-sizing: border-box; color: #333; font-size: 12px; line-height: 1.5;
      background: #fff;
    }
    .text-center { text-align: center; }
    .logo-container { margin-bottom: 15px; text-align: center; width: 100%; }
    .logo-container img { max-width: 100%; height: auto; max-height: 90px; object-fit: contain; }
    .shop-title { font-size: 16px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .shop-subtitle { font-size: 11px; }
    
    .divider { border-top: 1px dashed #666; margin: 10px 0; }
    
    .receipt-header { font-size: 14px; font-weight: 500; text-align: center; margin: 10px 0; letter-spacing: 0.5px; }
    
    .meta-info { font-size: 11px; margin-bottom: 10px; }
    .meta-info div { display: flex; justify-content: space-between; margin: 2px 0; }
    
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 5px; }
    th { padding: 4px 0; text-align: left; font-weight: 500; font-size: 11px; }
    td { padding: 4px 0; vertical-align: top; }
    .col-qty { width: 25px; }
    .col-desc { text-align: left; }
    .col-price { text-align: right; width: 60px; }
    
    .item-name { font-weight: 400; }
    .item-modifiers { font-size: 10px; color: #555; padding-left: 5px; }
    
    .items-sold { text-align: center; font-size: 11px; margin: 8px 0; }
    
    .totals-row { display: flex; justify-content: space-between; margin: 4px 0; }
    .total-line { font-size: 14px; font-weight: 500; margin-top: 5px; }
    
    .footer { text-align: center; font-size: 11px; margin-top: 15px; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="logo-container">
    ${logoBase64 ? `<img src="${logoBase64}" />` : `<div class="shop-title">CHIMNEY CORNER</div>`}
  </div>
  <div class="text-center">
    ${logoBase64 ? `<div class="shop-title">CHIMNEY CORNER</div>` : ''}
    <div class="shop-subtitle">+92300 4792829<br/>Gulberg 3 Lahore</div>
  </div>

  <div class="divider"></div>
  <div class="meta-info">
    <div><span>Order: #${data.orderNumber || 'Pending'}</span><span>Date: ${formatDate(data.dateTime)}</span></div>
    <div><span>Cashier: ${data.employeeName || 'Staff'}</span><span>Type: ${data.orderType || 'Take Away'}</span></div>
    ${(data.waiterInfo || data.tableNumber) ? `
      <div>
        ${data.waiterInfo ? `<span>Waiter: ${data.waiterInfo}</span>` : ''}
        ${data.tableNumber ? `<span>Table: ${data.tableNumber}</span>` : ''}
      </div>
    ` : ''}
    ${data.customerName ? `<div><span>Customer: ${data.customerName}</span></div>` : ''}
  </div>

  <div class="divider"></div>
  <div class="receipt-header">SALES RECEIPT</div>
  <div class="divider"></div>

  <table>
    <thead><tr><th class="col-desc">Item Description</th><th class="col-qty">Qty</th><th class="col-price">Price</th></tr></thead>
    <tbody>
      ${data.items.map((item: any) => `
        <tr>
          <td class="col-desc">
            <div class="item-name">${item.name}</div>
            ${item.modifiers && item.modifiers.length > 0 ? `<div class="item-modifiers">*** ${item.modifiers.join(', ')}</div>` : ''}
          </td>
          <td class="col-qty">${item.qty}</td>
          <td class="col-price">${(item.price * item.qty).toFixed(0)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="divider"></div>
  
  <div class="totals-row"><span>Sub Total:</span><span>${data.subtotal.toFixed(0)}</span></div>
  <div class="divider"></div>

  ${(data.discountAmount && data.discountAmount > 0) ? `
    <div class="totals-row"><span>Discount (${data.discountName || 'Promo'}):</span><span>-${data.discountAmount.toFixed(0)}</span></div>
    <div class="divider"></div>
  ` : ''}

  ${(data.tax && data.tax > 0) ? `
    <div class="totals-row"><span>Tax:</span><span>${data.tax.toFixed(0)}</span></div>
    <div class="divider"></div>
  ` : ''}
  
  <div class="totals-row total-line"><span>Total:</span><span>${data.total.toFixed(0)}</span></div>
  <div class="totals-row"><span>MOP:</span><span>${data.paymentMethod || 'CASH'}</span></div>
  
  ${(data.cashReceived && data.cashReceived > 0 && data.paymentMethod === 'CASH') ? `
    <div class="divider"></div>
    <div class="totals-row"><span>Tendered Total:</span><span>${data.cashReceived.toFixed(0)}</span></div>
    <div class="totals-row"><span>Change:</span><span>${(data.changeGiven || 0).toFixed(0)}</span></div>
  ` : ''}

  <div class="divider"></div>
  <div class="footer">
    <div>THANK YOU</div>
    <div style="margin-top: 10px; font-size: 9px; color: #888;">Powered by Zeeshan POS<br/>https://zeesho.dev</div>
  </div>
</body>
</html>
    `;
    setPreviewHtml(htmlContent);
  };

  const executePrintReceipt = async (receiptPayload: any) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      setPrintToast({ msg: 'Sending print job...', type: 'info' });
      try {
        const res = await (window as any).electronAPI.printReceipt(receiptPayload);
        if (res && res.success) {
          setPrintToast({ msg: 'Receipt printed successfully!', type: 'success' });
          setTimeout(() => setPrintToast(null), 3000);
          return true;
        } else {
          setPrintToast({ msg: `Printing failed: ${res?.error || 'Unknown error'}`, type: 'error' });
          setTimeout(() => setPrintToast(null), 5000);
          return false;
        }
      } catch (err: any) {
        setPrintToast({ msg: `Printing error: ${err.message}`, type: 'error' });
        setTimeout(() => setPrintToast(null), 5000);
        return false;
      }
    } else {
      setPrintToast({ msg: 'Opening browser print preview...', type: 'info' });
      showBrowserPreview(receiptPayload, settings?.printerLogoBase64);
      setTimeout(() => setPrintToast(null), 2000);
      return true;
    }
  };

  const submitOrder = async (paymentStatus: 'PAID' | 'PENDING') => {
    setOrderError('');
    if (!activeShift || !activeBusinessDay) { setOrderError('No active shift. Please start a shift first.'); return; }
    if (paymentStatus === 'PENDING') {
      if (orderType === 'DELIVERY') {
        if (!customerName.trim()) { setOrderError('Enter Customer Name.'); return; }
        if (!customerPhone.trim()) { setOrderError('Enter Phone.'); return; }
        if (!deliveryAddress.trim()) { setOrderError('Enter Delivery Address.'); return; }
      } else {
        // Table # is optional for all channels
        if (!waiterInfo) { setOrderError('Select a Waiter.'); return; }
      }
    }
    const { subtotal, tax, total, orderDiscountAmount } = getCartTotals();
    const method = editingOrderId ? 'PUT' : 'POST';
    const url = editingOrderId ? `${apiUrl}/api/orders/${editingOrderId}` : `${apiUrl}/api/orders`;
    
    setIsSubmitting(true);
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: settings.branchId, terminalId: settings.terminalId,
          paymentMethod: paymentStatus === 'PAID' ? paymentMethod : 'PENDING',
          paymentStatus, subtotal, tax, total,
          employeeId: activeShift.employeePin, shiftId: activeShift.id,
          items: buildOrderItems(cart), memberId: null,
          orderType, tableNumber: tableNumber || null,
          waiterInfo, customerName: orderType === 'DELIVERY' ? customerName : null,
          customerPhone: orderType === 'DELIVERY' ? customerPhone : null,
          deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : null,
          deliveryPlatform: orderType === 'DELIVERY' ? deliveryPlatform : null
        })
      });
      if (res.ok) {
        const created = await res.json();
        if (!skipPrintReceipt) {
          const receiptItems = cart.map(item => {
            let da = 0;
            if (item.discount && !item.isComplimentary) {
              let cost = item.unitPrice; item.modifiers.forEach(m => cost += m.price);
              const t = cost * item.quantity;
              da = item.discount.type === 'PERCENT' ? t * (item.discount.value / 100) : Math.min(t, item.discount.value);
            }
            const up = item.isComplimentary ? 0 : (item.discount ? Math.max(0, item.unitPrice - da / item.quantity) : item.unitPrice);
            return { name: `${item.productName} (${item.variantName})${da > 0 ? ` [Disc:-${da.toFixed(2)}]` : ''}`, qty: item.quantity, price: up, modifiers: item.modifiers.map(m => m.name) };
          });
          
          try {
            const actualChange = Math.max(0, parseFloat(cashReceived || '0') - total);
            const printSucceeded = await executePrintReceipt({ orderNumber: created.orderNumber, dateTime: created.createdAt, employeeName: activeShift.employeeName, items: receiptItems, subtotal, tax, total, discountAmount: orderDiscountAmount, discountName: orderDiscountAmount > 0 ? discount.name : undefined, paymentMethod: paymentStatus === 'PAID' ? paymentMethod : 'PENDING', cashReceived: (paymentMethod === 'CASH' && paymentStatus === 'PAID' && parseFloat(cashReceived) > 0) ? parseFloat(cashReceived) : undefined, changeGiven: (paymentMethod === 'CASH' && paymentStatus === 'PAID' && actualChange > 0) ? actualChange : undefined, orderType: created.orderType, tableNumber: created.tableNumber, waiterInfo: created.waiterInfo, customerName: created.customerName, customerPhone: created.customerPhone, deliveryAddress: created.deliveryAddress, taxRate: (settings?.taxEnabled ?? true) ? (settings?.taxRate ?? 10) : 0 });
            if (printSucceeded) {
              try {
                await fetch(`${apiUrl}/api/orders/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPrinted: true }) });
                created.isPrinted = true;
              } catch (e) { console.error('Failed to set isPrinted:', e); }
            }
          } catch (printErr) {
            console.error('Printing failed but order was saved successfully:', printErr);
          }
        }
        if (paymentStatus === 'PAID' && paymentMethod === 'CASH') {
          setChangeToReturn(Math.max(0, parseFloat(cashReceived) - total));
          setShowChangeModal(true);
        }
        if (paymentStatus === 'PAID') { handleNewOrder(); setIsCheckoutOpen(false); setCashReceived(''); }
        else handleLoadOrder(created);
        fetchAllPosData();
      } else { const err = await res.json(); showUiToast(err.error || 'Failed to submit order', 'error'); }
    } catch { showUiToast('Network error.', 'error'); }
    finally { setIsSubmitting(false); }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try { const r = await fetch(`${apiUrl}/api/orders/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) }); if (r.ok) fetchKdsOrders(); } catch (e) { console.error(e); }
  };

  const handlePrintUnpaidOrder = async () => {
    if (!originalOrder) return;
    const { subtotal, tax, total, discountAmount } = getCartTotals();
    const receiptItems = cart.map(item => {
      let da = 0;
      if (item.discount && !item.isComplimentary) {
        let cost = item.unitPrice; item.modifiers.forEach(m => cost += m.price);
        const t = cost * item.quantity;
        da = item.discount.type === 'PERCENT' ? t * (item.discount.value / 100) : Math.min(t, item.discount.value);
      }
      const up = item.isComplimentary ? 0 : (item.discount ? Math.max(0, item.unitPrice - da / item.quantity) : item.unitPrice);
      return { name: `${item.productName} (${item.variantName})${da > 0 ? ` [Disc:-${da.toFixed(2)}]` : ''}`, qty: item.quantity, price: up, modifiers: item.modifiers.map(m => m.name) };
    });
    const printSucceeded = await executePrintReceipt({ orderNumber: originalOrder.orderNumber, dateTime: originalOrder.createdAt, employeeName: activeShift?.employeeName || 'Staff', items: receiptItems, subtotal, tax, total, discountAmount, discountName: discountAmount > 0 ? discount.name : undefined, paymentMethod: originalOrder.paymentMethod, orderType: originalOrder.orderType, tableNumber: originalOrder.tableNumber, waiterInfo: originalOrder.waiterInfo, customerName: originalOrder.customerName, customerPhone: originalOrder.customerPhone, deliveryAddress: originalOrder.deliveryAddress, deliveryPlatform: originalOrder.deliveryPlatform, taxRate: (settings?.taxEnabled ?? true) ? (settings?.taxRate ?? 10) : 0 });
    if (printSucceeded) {
      try {
        await fetch(`${apiUrl}/api/orders/${originalOrder.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPrinted: true }) });
        fetchUnpaidOrders();
      } catch (e) { console.error('Failed to set isPrinted:', e); }
    }
  };

  const handleReopenOrder = async (orderId: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/orders/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: 'PENDING' }) });
      if (res.ok) { setSelectedHistoryOrder(null); fetchPaidOrders(); fetchAllPosData(); }
      else { const err = await res.json(); showUiToast(err.error || 'Failed to reopen order', 'error'); }
    } catch { showUiToast('Network error reopening order.', 'error'); }
  };

  const handleQuitApp = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.closeApp();
    } else {
      showUiToast('Exiting application is only supported inside the desktop app.', 'info');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TOTALS & CSS HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  const { subtotal, tax, total, discountAmount, orderDiscountAmount, itemDiscountsSum } = getCartTotals();

  const inputCls = "w-full px-3 py-2 bg-surface-50 border border-surface-300  text-surface-700 placeholder-surface-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 text-xs font-medium transition";
  const selectCls = "w-full px-3 py-2 bg-surface-50 border border-surface-300 text-surface-700 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const modalOverlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4";
  const modalCard = "w-full bg-surface-100 border border-surface-300  shadow-card-lg overflow-hidden flex flex-col";
  const modalHeader = "px-6 py-4 border-b border-surface-200 flex justify-between items-start shrink-0";
  const btnPrimary = "px-4 py-2 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-medium text-xs  shadow-brand tracking-wide transition";
  const btnSecondary = "px-4 py-2 border border-surface-300 text-surface-600 hover:text-surface-700 hover:bg-surface-200  text-xs font-medium transition";
  const navTabCls = (active: boolean) => `px-3 py-1.5  text-xs font-medium transition ${active ? 'bg-brand-500 text-white shadow-brand' : 'text-surface-500 hover:bg-surface-200 hover:text-surface-600'}`;

  // ─────────────────────────────────────────────────────────────────────────
  // DISCOUNT FORM
  // ─────────────────────────────────────────────────────────────────────────
  const renderPromoForm = () => (
    <>
      <div className="space-y-2">
        <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Preset Discounts</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'No Discount', sub: 'Reset', type: 'NONE' as const, value: 0, name: '' },
            { label: 'Staff', sub: '10% Off', type: 'PERCENT' as const, value: 10, name: 'Staff 10%' },
            { label: 'Student', sub: '15% Off', type: 'PERCENT' as const, value: 15, name: 'Student 15%' },
            { label: 'Manager', sub: '20% Off', type: 'PERCENT' as const, value: 20, name: 'Manager 20%' },
            { label: 'Flat 5', sub: '-5.00', type: 'FIXED' as const, value: 5, name: 'Promo 5' },
            { label: 'Reward 10', sub: '-10.00', type: 'FIXED' as const, value: 10, name: 'Reward 10' },
          ].map((p) => {
            const active = p.type === 'NONE' ? isTargetDiscountNone() : isTargetDiscountActive(p.name);
            return (
              <button key={p.name || 'none'} type="button" onClick={() => handleApplyDiscount(p.type, p.value, p.name)}
                className={`py-2.5 px-3  border text-xs transition text-left flex justify-between items-center ${active ? 'bg-brand-500/15 border-brand-500 text-brand-400' : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/50 hover:text-surface-600'}`}>
                <span className="font-medium">{p.label}</span>
                <span className={`text-[10px] font-semibold ${active ? 'text-brand-400' : 'text-success-400'}`}>{p.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2 pt-3 border-t border-surface-200">
        <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Custom Discount</label>
        <div className="grid grid-cols-2 gap-2">
          {(['PERCENT', 'FIXED'] as const).map(t => (
            <button key={t} type="button" onClick={() => setCustomDiscountType(t)}
              className={`py-1.5  border text-xs font-medium transition ${customDiscountType === t ? 'bg-brand-500 border-brand-500 text-white' : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/50'}`}>
              {t === 'PERCENT' ? '% Percentage' : ' Fixed Amount'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" step="0.01" min="0" value={customDiscountValue} onChange={e => setCustomDiscountValue(e.target.value)} placeholder={customDiscountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 5'} className={`col-span-1 ${inputCls}`} />
          <input type="text" value={customDiscountName} onChange={e => setCustomDiscountName(e.target.value)} placeholder="Reason / Label" className={`col-span-2 ${inputCls}`} />
        </div>
        <button type="button" onClick={() => {
          const val = parseFloat(customDiscountValue);
          if (isNaN(val) || val <= 0) { showUiToast('Enter a valid discount value.', 'error'); return; }
          if (discountFlowStep === 'FULL') { if (!checkDiscountValid('order', customDiscountType, val)) return; }
          else { if (selectedIndividualItemIds.length === 0) { showUiToast('Select items first.', 'error'); return; } if (selectedIndividualItemIds.some(id => !checkDiscountValid(id, customDiscountType, val))) return; }
          handleApplyDiscount(customDiscountType, val, customDiscountName.trim() || (customDiscountType === 'PERCENT' ? `${val}%` : `${val}`));
          setCustomDiscountValue(''); setCustomDiscountName('');
        }} className="w-full py-2 bg-surface-200 hover:bg-surface-300 text-surface-600 hover:text-surface-700 border border-surface-300 text-xs font-medium  transition">
          Apply Custom
        </button>
      </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED SCREENS HEADER
  // ─────────────────────────────────────────────────────────────────────────
  const renderSplashHead = (title: string) => (
    <Head>
      <title>{`${title} · CHIMNEY CORNER`}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </Head>
  );

  const renderSplashBg = () => (
    <>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-brand-500/8 rounded-full filter blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-72 h-72 bg-accent-400/6 rounded-full filter blur-[60px] pointer-events-none" />
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN 1: DAY CLOSED
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'DAY_CLOSED') {
    return (
      <div className="min-h-screen page-bg flex flex-col justify-center items-center px-4 relative overflow-hidden">
        {renderSplashHead('Day Closed')}
        {renderSplashBg()}
        <div className="w-full max-w-sm relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-600 text-white mb-5 shadow-brand">
              <ShoppingCart className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-semibold text-surface-700 tracking-tight">CHIMNEY CORNER</h1>
            <p className="text-xs text-surface-400 mt-1 font-medium">Terminal {settings.terminalId} · Branch {settings.branchId}</p>
          </div>
          <div className="bg-surface-100 border border-surface-200  p-7 shadow-card-lg text-center space-y-5">
            <div className="w-14 h-14 mx-auto bg-surface-200 border border-surface-300 flex items-center justify-center">
              <Moon className="w-7 h-7 text-surface-400" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-surface-700">Business Day is Closed</h2>
              <p className="text-xs text-surface-400 font-medium">Open the business day register to begin taking orders.</p>
            </div>
            <button onClick={handleStartBusinessDay}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold text-sm shadow-brand tracking-wide transition flex items-center justify-center gap-2">
              <Sun className="w-4 h-4" /> Start Business Day
            </button>
            <button onClick={handleQuitApp}
              className="w-full py-2.5 border border-surface-300 text-surface-500 hover:text-surface-600 hover:bg-surface-200  text-xs font-medium transition">
              Exit Application
            </button>
          </div>
          <div className="mt-4 flex justify-between items-center text-[10px] text-surface-400 px-1">
            <span>{settings.isMaster ? '● Master POS' : '○ Worker POS'}</span>
            <button
              type="button"
              onClick={() => {
                const nextTheme = theme === 'dark' ? 'light' : 'dark';
                setTheme(nextTheme);
                localStorage.setItem('pos-theme', nextTheme);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-surface-300 bg-surface-100 hover:bg-surface-200 text-surface-500 hover:text-surface-600 transition font-medium"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3 text-indigo-500" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN 2: SHIFT LOGIN (PIN)
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'SHIFT_LOGIN') {
    return (
      <div className="min-h-screen page-bg flex flex-col justify-center items-center px-4 relative overflow-hidden">
        {renderSplashHead('Sign In')}
        {renderSplashBg()}

        <div className="w-full max-w-sm relative z-10">
          <div className="text-center mb-8">

            <h1 className="text-2xl font-semibold text-surface-700 tracking-tight">CHIMNEY CORNER</h1>
            <p className="text-xs text-surface-400 mt-1 font-medium">Terminal {settings.terminalId} · Branch {settings.branchId}</p>
          </div>

          <div className="bg-surface-100 border border-surface-200  p-6 shadow-card-lg space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-sm font-semibold text-surface-600">Enter your PIN</h2>
              <p className="text-xs text-surface-400">Enter 4-digit employee PIN to clock in</p>
            </div>

            {/* PIN dots display */}
            <div className="flex justify-center gap-3 py-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < loginPin.length ? 'bg-brand-500 border-brand-500 scale-110' : 'bg-transparent border-surface-400'}`} />
              ))}
            </div>

            {loginError && (
              <div className="text-center text-xs text-danger-400 font-medium bg-danger-50 border border-danger-100 py-2 px-3 ">
                {loginError}
              </div>
            )}

            {loginLoading && (
              <div className="text-center text-xs text-surface-400">Verifying…</div>
            )}

            {/* PIN Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                <button key={i} type="button"
                  onClick={() => d === '⌫' ? handlePinDelete() : d !== '' ? handlePinDigit(d) : undefined}
                  disabled={loginLoading || d === ''}
                  className={`h-12  font-semibold text-sm transition active:scale-95 ${d === '⌫' ? 'bg-surface-200 border border-surface-300 text-surface-500 hover:bg-surface-300' : d === '' ? 'invisible' : 'bg-surface-50 border border-surface-300 text-surface-600 hover:bg-surface-200 hover:text-surface-700'} disabled:cursor-not-allowed`}>
                  {d === '⌫' ? <Delete className="w-4 h-4 mx-auto" /> : d}
                </button>
              ))}
            </div>

            {/* End Day footer */}
            <div className="border-t border-surface-200 pt-3">
              <button type="button" onClick={handleQuitApp} className="w-full py-2 border border-surface-300 text-surface-500 hover:text-surface-600 hover:bg-surface-200 font-medium text-xs  transition">
                Exit Application
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center text-[10px] text-surface-400 px-1">
            <span>{settings.isMaster ? '● Master POS' : '○ Worker POS'}</span>
            <button
              type="button"
              onClick={() => {
                const nextTheme = theme === 'dark' ? 'light' : 'dark';
                setTheme(nextTheme);
                localStorage.setItem('pos-theme', nextTheme);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-surface-300 bg-surface-100 hover:bg-surface-200 text-surface-500 hover:text-surface-600 transition font-medium"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3 text-indigo-500" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREEN 3: POS (ACTIVE)
  // ─────────────────────────────────────────────────────────────────────────
  const activeCategories = categoriesList.filter(c => c.status === 'ACTIVE');
  const categories = activeCategories;

  const activeProducts = products.filter(p => {
    if (p.status === 'DISABLED') return false;
    const catObj = categoriesList.find(c => c.name.toLowerCase() === p.category.toLowerCase());
    if (catObj && catObj.status === 'DISABLED') return false;
    return true;
  });

  const fallbackProductImage = './dummy-product.svg';
  const getProductImage = (imageUrl?: string) => {
    if (!imageUrl) return fallbackProductImage;
    return imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('data:image/')
      ? imageUrl
      : fallbackProductImage;
  };

  const currentCategory = categories.find(c => c.name === selectedCategory)?.name || (categories[0]?.name || '');
  const filteredProducts = activeProducts.filter(p => p.category === currentCategory);

  return (
    <div className="billing-light h-screen bg-white text-slate-800 flex flex-col overflow-hidden">
      <Head>
        <title>Billing · POS</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      {/* ── Low-stock alert bar ── */}
      {lowStockWarnings.length > 0 && (
        <div className="bg-accent-900/40 border-b border-accent-400/20 px-6 py-2 flex items-center justify-between text-accent-400 text-xs font-medium shrink-0">
          <span className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />Low stock: {lowStockWarnings.join(', ')}</span>
          <button onClick={() => setLowStockWarnings([])} className="px-2 py-0.5 rounded bg-accent-400/10 hover:bg-accent-400/20 border border-accent-400/20 text-[10px] transition">Dismiss</button>
        </div>
      )}

      {/* ── Header ── */}
      <header className="h-14 px-5 border-b border-[#f3d9e6] bg-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">

            <span className="font-semibold text-sm text-[#4a2638]">CHIMNEY CORNER</span>
          </div>
          <div className="h-4 w-px bg-[#f3d9e6]" />
          <nav className="flex gap-1">
            <button onClick={() => setActiveTab('POS')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeTab === 'POS' ? 'bg-[#e85d9e] text-white shadow-sm' : 'text-[#8d6678] hover:bg-[#fff0f6] hover:text-[#c33f78]'}`}>Billing</button>
              <button onClick={() => setActiveTab('KDS')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeTab === 'KDS' ? 'bg-[#e85d9e] text-white shadow-sm' : 'text-[#8d6678] hover:bg-[#fff0f6] hover:text-[#c33f78]'}`}>
                KDS {kdsOrders.length > 0 && <span className="ml-1 bg-[#f9d5e5] text-[#c33f78] px-1.5 py-0.5 rounded text-[10px] font-semibold">{kdsOrders.length}</span>}
            </button>
            <button onClick={() => setActiveTab('PAID_ORDERS')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeTab === 'PAID_ORDERS' ? 'bg-[#e85d9e] text-white shadow-sm' : 'text-[#8d6678] hover:bg-[#fff0f6] hover:text-[#c33f78]'}`}>History</button>
          </nav>
          {activeTab === 'POS' && (
            <div className="flex gap-1 ml-1">
              {editingOrderId && (
                <button onClick={() => {
                  const action = () => {
                    setTempOrderType(orderType);
                    setTempTableNumber(tableNumber);
                    setTempWaiterInfo(waiterInfo);
                    setTempCustomerName(customerName);
                    setTempCustomerPhone(customerPhone);
                    setTempDeliveryAddress(deliveryAddress);
                    setTempDeliveryPlatform(deliveryPlatform);
                    setIsUpdateDetailsOpen(true);
                  };
                  triggerAdminAuth(action);
                }}
                  className="px-3 py-1.5  text-xs font-medium text-surface-500 border border-surface-300 hover:bg-surface-200 hover:text-surface-600 flex items-center gap-1 transition">
                  <Edit className="w-3.5 h-3.5" /> Update Details
                </button>
              )}
              <button onClick={() => {
                const action = () => {
                  setSelectedIndividualItemIds(selectedCartItemId ? [selectedCartItemId] : []);
                  setDiscountFlowStep('CHOOSE');
                  setIsDiscountOpen(true);
                };
                if (editingOrderId) {
                  triggerAdminAuth(action);
                } else {
                  action();
                }
              }}
                className="px-3 py-1.5  text-xs font-medium text-surface-500 border border-surface-300 hover:bg-surface-200 flex items-center gap-1 transition">
                <Award className="w-3.5 h-3.5 text-accent-400" /> Discounts
              </button>
              <button type="button" disabled={!selectedCartItemId} onClick={() => {
                if (editingOrderId) {
                  triggerAdminAuth(handleToggleComplimentary);
                } else {
                  handleToggleComplimentary();
                }
              }}
                className={`px-3 py-1.5  text-xs font-medium flex items-center gap-1 transition border ${selectedCartItemId ? 'text-accent-400 border-accent-400/30 bg-accent-400/5 hover:bg-accent-400/10' : 'text-surface-400 border-surface-300 cursor-not-allowed'}`}>
                <Gift className="w-3.5 h-3.5" /> Comp
              </button>
              <button type="button" disabled={cart.length === 0 || isSubmitting} onClick={() => {
                if (editingOrderId) {
                  triggerAdminAuth(handleVoidBill);
                } else {
                  handleVoidBill();
                }
              }}
                className={`px-3 py-1.5  text-xs font-medium flex items-center gap-1 transition border ${cart.length > 0 && !isSubmitting ? 'text-danger-400 border-danger-400/30 bg-danger-400/5 hover:bg-danger-400/10' : 'text-surface-400 border-surface-300 cursor-not-allowed'}`}>
                <Trash2 className="w-3.5 h-3.5" /> Void Bill
              </button>
              {selectedBulkItemIds.length > 0 && (
                <button type="button" disabled={isSubmitting} onClick={() => {
                  if (editingOrderId) {
                    triggerAdminAuth(handleBulkDelete);
                  } else {
                    handleBulkDelete();
                  }
                }}
                  className={`px-3 py-1.5 ml-2 text-xs font-medium flex items-center gap-1 transition border rounded-md shadow-sm ${!isSubmitting ? 'text-white border-danger-500 bg-danger-500 hover:bg-danger-600' : 'text-surface-400 border-surface-300 bg-surface-200 cursor-not-allowed'}`}>
                  <Delete className="w-3.5 h-3.5" /> Delete Selected ({selectedBulkItemIds.length})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {settings.isMaster && (
            <div className="flex items-center gap-1.5 text-xs text-surface-400 font-medium">
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus > 0 ? 'animate-spin text-brand-500' : 'text-surface-400'}`} />
              <span>{syncStatus} pending</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs font-medium bg-[#fff7fa] border border-[#f3d9e6] px-3 py-1.5 rounded-lg">
            <User className="w-3.5 h-3.5 text-[#d94f8f]" />
            <span className="text-[#6d4658]">{loggedInEmployee ? loggedInEmployee.name : (activeShift ? activeShift.employeeName : 'Staff')}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextTheme = theme === 'dark' ? 'light' : 'dark';
              setTheme(nextTheme);
              localStorage.setItem('pos-theme', nextTheme);
            }}
            className="p-2 rounded-lg border border-[#f3d9e6] bg-white text-[#8d6678] hover:bg-[#fff0f6] hover:text-[#c33f78] transition flex items-center justify-center shrink-0"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <Sun className="w-4 h-4 text-[#d94f8f]" />
          </button>
          <button onClick={() => {
            setLoggedInEmployee(null);
            setScreen('SHIFT_LOGIN');
            setLoginPin('');
            setLoginError('');
          }}
            className="p-2 rounded-lg border border-[#f3d9e6] bg-white text-[#8d6678] hover:bg-[#fff0f6] hover:text-[#c33f78] transition flex items-center gap-1.5 px-3 text-xs font-medium"
            title="Lock POS">
            <Lock className="w-4 h-4" /> Lock
          </button>
          <button onClick={() => { triggerAdminAuth(() => { setActiveTab('ADMIN'); setAdminTab('shift'); }); }}
            className={`p-2 rounded-lg border text-[#8d6678] hover:bg-[#fff0f6] hover:text-[#c33f78] transition flex items-center gap-1.5 px-3 text-xs font-medium ${activeTab === 'ADMIN' ? 'bg-[#fff0f6] border-[#e85d9e] text-[#c33f78] font-semibold' : 'bg-white border-[#f3d9e6]'}`}
            title="System Admin">
            <Settings className="w-4 h-4" /> Admin
          </button>
          {updateStatus?.status === 'ready' && (
            <button onClick={() => setShowUpdateModal(true)}
              className="p-2 border border-brand-500 bg-brand-500 hover:bg-brand-600 text-white transition flex items-center gap-1.5 px-3 text-xs font-semibold shadow-sm animate-pulse"
              title="Install Update">
              <Download className="w-4 h-4" /> Update Ready
            </button>
          )}
        </div>
      </header>

      {/* ── Active register warning alert ── */}
      {(!activeBusinessDay || !activeShift) && (
        <button onClick={() => { triggerAdminAuth(() => { setActiveTab('ADMIN'); setAdminTab(!activeBusinessDay ? 'day' : 'shift'); }); }}
          className="w-full bg-amber-500/10 hover:bg-amber-500/15 border-b border-amber-500/20 px-6 py-2 flex items-center justify-center text-amber-400 text-xs font-semibold gap-2 shrink-0 transition">
          <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>No active register. Click here to open the Business Day / Shift in the Admin panel.</span>
        </button>
      )}

      {/* ── Auto Update alert ── */}
      {updateStatus && (
        <div className={`w-full px-6 py-2 flex items-center justify-center text-xs font-semibold gap-2 shrink-0 transition ${updateStatus.status === 'ready' ? 'bg-success-500/10 hover:bg-success-500/15 border-b border-success-500/20 text-success-500 cursor-pointer' : 'bg-brand-500/10 border-b border-brand-500/20 text-brand-400'}`}
          onClick={() => {
            if (updateStatus.status === 'ready' && typeof window !== 'undefined' && (window as any).electronAPI) {
              (window as any).electronAPI.restartAndInstall();
            }
          }}>
          {updateStatus.status === 'downloading' ? (
            <>
              <div className="animate-spin w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full" />
              <span>Downloading System Update... {updateStatus.progress ? Math.round(updateStatus.progress) + '%' : ''}</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 animate-bounce" />
              <span>System Update Ready! Click here to restart and install.</span>
            </>
          )}
        </div>
      )}

      {/* ── POS WORKSPACE ── */}
      {activeTab === 'POS' && (
        <div className="flex-1 flex overflow-hidden bg-[#f8f7fb] text-slate-800">
          {/* Left: Cart */}
          <aside className="w-[35%] border-r border-[#e9e4f3] flex flex-col bg-white overflow-hidden shrink-0 shadow-[4px_0_18px_rgba(79,70,229,0.04)]">
            <div className="px-5 py-4 border-b border-[#eeeaf6] flex justify-between items-center shrink-0">
              <h2 className="font-bold text-sm text-slate-700 flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#f0eafd] text-[#7654d6] flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </span>
                Current Order
              </h2>
              <span className="px-2.5 py-1 rounded-full bg-[#f8e8f2] text-[#c04b85] text-[10px] font-bold">{cart.length} items</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-[#fdfcff]">
              {cart.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center text-slate-400">
                  <span className="w-12 h-12 rounded-2xl bg-[#f3effc] flex items-center justify-center mb-3">
                    <ShoppingCart className="w-6 h-6 stroke-[1.5] text-[#9b83df]" />
                  </span>
                  <span className="text-xs font-medium">Your order is empty</span>
                  <span className="text-[10px] mt-1 text-slate-400">Select a product to get started</span>
                </div>
              ) : cart.map(item => {
                const isSel = selectedCartItemId === item.id;
                let cost = item.isComplimentary ? 0 : item.unitPrice;
                if (!item.isComplimentary) item.modifiers.forEach(m => cost += m.price);
                const lineTotal = cost * item.quantity;
                let da = 0;
                if (item.discount && !item.isComplimentary) da = item.discount.type === 'PERCENT' ? lineTotal * (item.discount.value / 100) : Math.min(lineTotal, item.discount.value);
                const displayTotal = lineTotal - da;
                return (
                  <div key={item.id} onClick={() => setSelectedCartItemId(isSel ? null : item.id)}
                    className={`flex justify-between items-center py-2.5 px-3 rounded-xl border cursor-pointer transition ${isSel ? 'bg-[#f2edff] border-[#a991ec] shadow-sm' : 'bg-white border-[#eeeaf6] hover:border-[#d8ccf4] hover:bg-[#fcfaff]'}`}>
                    <div className="flex items-center justify-center mr-2 h-full" onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        className="w-4 h-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
                        checked={selectedBulkItemIds.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBulkItemIds([...selectedBulkItemIds, item.id]);
                          } else {
                            setSelectedBulkItemIds(selectedBulkItemIds.filter(id => id !== item.id));
                          }
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-700 truncate">{item.productName}</span>
                        <span className="text-[9px] text-[#7654d6] font-bold bg-[#f0eafd] px-1.5 py-0.5 rounded-full">x{item.quantity}</span>
                        {item.isComplimentary && <span className="text-[9px] text-success-400 bg-success-100/15 px-1 rounded border border-success-400/20 font-bold">FREE</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-px leading-none">{item.variantName}</span>
                      {item.modifiers.length > 0 && (
                        <span className="text-[9px] text-slate-400 block mt-px leading-none truncate" title={item.modifiers.map(m => m.name).join(', ')}>
                          + {item.modifiers.map(m => m.name).join(', ')}
                        </span>
                      )}
                      {item.discount && !item.isComplimentary && (
                        <div className="text-[9px] text-success-400 font-medium mt-px flex items-center gap-0.5">
                          <Award className="w-2.5 h-2.5" /> {item.discount.name} (-{da.toFixed(2)})
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {item.isComplimentary ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10px] text-surface-400 line-through">{lineTotal.toFixed(2)}</span>
                          <span className="font-semibold text-xs text-success-400">0.00</span>
                        </div>
                      ) : item.discount ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-[10px] text-surface-400 line-through">{lineTotal.toFixed(2)}</span>
                          <span className="font-semibold text-xs text-slate-700">{displayTotal.toFixed(2)}</span>
                        </div>
                      ) : (
                        <span className="font-semibold text-xs text-slate-700">{displayTotal.toFixed(2)}</span>
                      )}
                      <button onClick={() => {
                        if (editingOrderId) {
                          triggerAdminAuth((reason) => {
                            fetch(`${apiUrl}/api/settings/deletions`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                orderNumber: originalOrder?.orderNumber || 'Unknown',
                                itemName: `${item.productName} (${item.variantName})`,
                                reason: reason || 'N/A',
                                authorizedBy: 'Manager',
                                cashierName: activeShift?.employeeName || 'Staff'
                              })
                            }).catch(err => console.error('Failed to log item deletion:', err));

                            handleRemoveFromCart(item.id);
                          }, true);
                        } else {
                          handleRemoveFromCart(item.id);
                        }
                      }} className="text-danger-400 hover:text-danger-500 text-xs px-1 py-0.5 rounded hover:bg-danger-50 transition">×</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order details */}
            <div className="px-5 py-4 border-t border-[#eeeaf6] space-y-3 shrink-0 bg-white">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Order Details</span>
                {!!editingOrderId && <span className="flex items-center gap-1 text-[10px] text-brand-400 font-medium bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20"><Edit className="w-2.5 h-2.5" /> Edit Mode</span>}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['DINE_IN', 'TAKE_AWAY', 'DELIVERY'] as const).map(type => (
                  <button key={type} type="button" onClick={() => setOrderType(type)}
                    className={`py-1.5  border text-[10px] font-medium transition ${orderType === type ? 'bg-brand-500 border-brand-500 text-white' : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/40 hover:text-brand-400'}`}>
                    {type === 'DINE_IN' ? 'Dine In' : type === 'TAKE_AWAY' ? 'Take Away' : 'Delivery'}
                  </button>
                ))}
              </div>
              {orderType !== 'DELIVERY' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-surface-400 mb-1">Waiter</label>
                    <select value={waiterInfo} onChange={e => setWaiterInfo(e.target.value)} className={selectCls}>
                      <option value="">{waitersList.length === 0 ? 'No Waiters' : 'Select'}</option>
                      {waitersList.map((w: string) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-surface-400 mb-1">Table #</label>
                    <input type="text" value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="Table #" className={inputCls} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" className={inputCls} />
                    <select value={deliveryPlatform} onChange={e => setDeliveryPlatform(e.target.value)} className={selectCls}>
                      <option value="FOODPANDA">Foodpanda</option>
                      <option value="UBER_EATS">Uber Eats</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone" className={inputCls} />
                    <input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Address" className={inputCls} />
                  </div>
                </div>
              )}
            </div>

            {/* Totals & Actions */}
            <div className="border-t border-[#eeeaf6] px-5 py-4 bg-[#faf9fd] space-y-3 shrink-0">
              {orderError && (
                <div className="text-[10px] text-danger-400 font-medium bg-danger-50 border border-danger-100 py-1.5 px-3 text-center">
                  {orderError}
                </div>
              )}
              <div className="space-y-1 text-xs font-medium">
                <div className="flex justify-between text-surface-400">
                  <span>Subtotal</span><span>{(subtotal + discountAmount).toFixed(2)}</span>
                </div>
                {orderDiscountAmount > 0 && (
                  <div className="flex justify-between text-success-400">
                    <span className="flex items-center gap-1"><Award className="w-3 h-3" /> {discount.name || 'Order Discount'}</span>
                    <span>-{orderDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {itemDiscountsSum > 0 && (
                  <div className="flex justify-between text-success-400">
                    <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Item Discounts</span>
                    <span>-{itemDiscountsSum.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-surface-400"><span>Tax ({(settings?.taxEnabled ?? true) ? `${settings?.taxRate ?? 10}%` : 'Disabled'})</span><span>{tax.toFixed(2)}</span></div>
                <div className="h-px bg-surface-200 my-1" />
                <div className="flex justify-between text-surface-700 text-sm font-semibold">
                  <span>Total</span><span className="text-brand-400">{total.toFixed(2)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(!editingOrderId || isCartDirty) ? (
                  <button disabled={(!editingOrderId && cart.length === 0) || isSubmitting} onClick={() => submitOrder('PENDING')}
                    className={`py-3 text-center text-xs font-semibold uppercase tracking-wide  transition border ${(editingOrderId || cart.length > 0) && !isSubmitting ? 'bg-surface-200 hover:bg-surface-300 border-surface-300 text-surface-600 hover:text-surface-700' : 'bg-surface-200 border-surface-200 text-surface-400 cursor-not-allowed'}`}>
                    Punch Order
                  </button>
                ) : (
                  <button onClick={handlePrintUnpaidOrder} disabled={isSubmitting}
                    className={`py-3 text-center text-xs font-semibold uppercase tracking-wide transition border ${!isSubmitting ? 'bg-success-500 hover:bg-success-600 border-success-600 text-white' : 'bg-surface-200 border-surface-200 text-surface-400 cursor-not-allowed'}`}>
                    Print
                  </button>
                )}
                <button disabled={cart.length === 0 || !editingOrderId || isCartDirty || isSubmitting} onClick={() => { setCheckoutStep(1); setPaymentMethod('CASH'); setCashReceived(''); setIsCheckoutOpen(true); }}
                  className={`py-3 text-center text-xs font-semibold uppercase tracking-wide  transition ${cart.length > 0 && editingOrderId && !isCartDirty && !isSubmitting ? 'bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.98] shadow-brand' : 'bg-surface-200 text-surface-400 cursor-not-allowed'}`}>
                  Cashout
                </button>
              </div>
            </div>
          </aside>

          {/* Right: Product Grid */}
          <main className="flex-1 flex flex-col overflow-hidden bg-[#f8f7fb]">
            {/* Active Tickets Bar */}
            <div className="bg-white border-b border-[#eeeaf6] px-5 py-3 flex items-center gap-3 shrink-0 overflow-x-auto scrollbar-none">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase tracking-wider whitespace-nowrap">
                Tickets <span className="bg-brand-500/15 text-brand-400 px-1.5 py-0.5 rounded text-[10px]">{unpaidOrders.length}</span>
              </div>
              <div className="h-4 w-px bg-surface-300 shrink-0" />
              <div className="flex gap-2">
                <button onClick={handleNewOrder}
                  className={`flex items-center gap-1 px-3 py-1.5  text-xs font-medium border shrink-0 transition ${!editingOrderId ? 'bg-brand-500/10 border-brand-500/40 text-brand-400' : 'bg-surface-100 border-surface-300 text-surface-500 hover:bg-surface-200'}`}>
                  + New
                </button>
                {unpaidOrders.map(order => {
                  const isEditing = editingOrderId === order.id;
                  let cardBg = '', typeLabelColor = '', numColor = '', subtextColor = '', priceColor = '';
                  if (!order.isPrinted) {
                    cardBg = isEditing ? 'bg-success-500/15 border-success-500 text-success-300 shadow-[0_0_12px_rgba(34,197,94,0.15)]' : 'bg-success-500/5 border-success-500/20 hover:bg-success-500/10 hover:border-success-500/30 text-success-400';
                    typeLabelColor = 'text-success-400/70'; numColor = 'text-success-400 font-bold'; subtextColor = 'text-success-400/60'; priceColor = 'text-success-400';
                  } else if (order.orderType === 'TAKE_AWAY') {
                    cardBg = isEditing ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/30 text-amber-400';
                    typeLabelColor = 'text-amber-400/70'; numColor = 'text-amber-400 font-bold'; subtextColor = 'text-amber-400/60'; priceColor = 'text-amber-400';
                  } else if (order.orderType === 'DELIVERY') {
                    cardBg = isEditing ? 'bg-gradient-to-br from-pink-500/15 to-violet-500/15 border-pink-500 text-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.15)]' : 'bg-gradient-to-br from-pink-500/5 to-violet-500/5 border-pink-500/20 hover:from-pink-500/10 hover:to-violet-500/10 hover:border-pink-500/30 text-pink-400';
                    typeLabelColor = 'text-pink-400/70'; numColor = 'text-pink-400 font-bold'; subtextColor = 'text-pink-400/60'; priceColor = 'text-pink-400';
                  } else {
                    cardBg = isEditing ? 'bg-brand-500/10 border-brand-500/40 text-brand-400' : 'bg-surface-100 border-surface-200 text-surface-500 hover:bg-surface-200 hover:border-surface-300';
                    typeLabelColor = 'text-surface-400'; numColor = 'text-brand-400'; subtextColor = 'text-surface-400'; priceColor = isEditing ? 'text-brand-400' : 'text-surface-600';
                  }
                  return (
                    <button key={order.id} onClick={() => handleLoadOrder(order)}
                      className={`flex flex-col px-3 py-2  border text-left min-w-[120px] transition shrink-0 ${cardBg}`}>
                      <div className="flex justify-between items-center gap-2 w-full">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${typeLabelColor}`}>
                          {order.orderType === 'DINE_IN' ? `T${order.tableNumber || '?'}` : order.orderType === 'TAKE_AWAY' ? 'T/A' : 'Del'}
                        </span>
                        <span className={`text-[10px] font-semibold ${numColor}`}>#{order.orderNumber.split('-').pop()}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-1 w-full mt-0.5">
                        <span className={`text-[10px] truncate max-w-[60px] ${subtextColor}`}>{order.waiterInfo || '—'}</span>
                        <span className={`text-xs font-semibold ${priceColor}`}>{order.total.toFixed(2)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category bar */}
            <div className="px-5 py-4 border-b border-[#eeeaf6] bg-white flex gap-3 overflow-x-auto shrink-0 scrollbar-none">
              {categories.map(cat => {
                const isSelected = selectedCategory === cat.name || currentCategory === cat.name;
                const hasCustomColor = !!cat.bgColor;
                const categoryProduct = activeProducts.find(product => product.category.toLowerCase() === cat.name.toLowerCase());
                const categoryImage = getProductImage(cat.imageUrl || categoryProduct?.imageUrl);
                return (
                  <button key={cat.name} onClick={() => setSelectedCategory(cat.name)}
                    className={`relative overflow-hidden px-4 rounded-2xl text-xs font-bold whitespace-nowrap transition min-w-[132px] h-[76px] flex flex-col items-start justify-end p-3 border ${isSelected
                      ? 'bg-[#e85d9e] border-[#e85d9e] text-white shadow-[0_8px_18px_rgba(232,93,158,0.22)]'
                      : 'bg-white border-[#f3d9e6] text-[#6d4658] hover:border-[#e8a9c5] hover:bg-[#fff5f9]'
                      }`}>
                    <img src={categoryImage} alt="" className="absolute inset-0 w-full h-full object-contain p-1 opacity-25" />
                    <span className="relative z-10">{cat.name}</span>
                    <span className={`relative z-10 text-[9px] mt-1 ${isSelected ? 'text-white/70' : 'text-[#b58c9e]'}`}>Browse items</span>
                  </button>
                );
              })}
            </div>

            {/* Products */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {filteredProducts.map(p => {
                  return (
                    <button key={p.id} onClick={() => handleProductClick(p)}
                      className="text-left flex flex-col items-stretch h-[190px] rounded-2xl group relative overflow-hidden transition-all border bg-white border-[#f3d9e6] shadow-[0_5px_16px_rgba(180,75,125,0.06)] hover:-translate-y-1 hover:border-[#e8a9c5] hover:shadow-[0_10px_24px_rgba(232,93,158,0.16)]"
                    >
                      <div className="h-[124px] w-full flex items-center justify-center overflow-hidden bg-[#fff0f6]">
                        <img src={getProductImage(p.imageUrl)} alt="" className="w-full h-full object-contain p-2 transition duration-300" />
                      </div>
                      <div className="flex-1 px-3.5 py-3 flex flex-col justify-between">
                        <h3 className="font-bold text-sm leading-tight line-clamp-2 transition text-[#4a2638] group-hover:text-[#c33f78]">{p.name}</h3>
                        {p.variants?.[0] && <span className="text-xs mt-1 text-[#d94f8f] font-bold">Rs. {Number(p.variants[0].price).toFixed(2)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* KDS TAB */}
      {activeTab === 'KDS' && (
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-base font-semibold text-surface-700">Kitchen Display Queue</h2>
            <span className="px-2.5 py-1  bg-brand-500/10 text-brand-400 text-xs font-semibold border border-brand-500/20">{kdsOrders.length} Orders</span>
          </div>
          {kdsOrders.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center border border-dashed border-surface-300 bg-surface-100/30">
              <CheckCircle className="w-10 h-10 stroke-[1.5] mb-2 text-success-500" />
              <span className="text-sm font-medium text-surface-500">All Clear</span>
              <span className="text-xs mt-1 text-surface-400">No pending orders in queue.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {kdsOrders.map(order => {
                const age = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                const urgentCls = age > 10 ? 'border-danger-500/50 bg-danger-50/5' : age > 5 ? 'border-accent-400/40 bg-accent-400/5' : 'border-surface-200 bg-surface-100';
                return (
                  <div key={order.id} className={`border  flex flex-col h-80 overflow-hidden shadow-card ${urgentCls}`}>
                    <div className="px-4 py-3 border-b border-surface-200/50 bg-surface-100/50 flex justify-between items-center shrink-0">
                      <div>
                        <span className="font-semibold text-sm text-surface-600">{order.orderNumber.split('-').pop()}</span>
                        <p className="text-[10px] text-surface-400 mt-0.5">
                          {order.orderType === 'DINE_IN' ? `Dine In · T${order.tableNumber || '?'}` : order.orderType === 'TAKE_AWAY' ? 'Take Away' : `Delivery (${order.deliveryPlatform || '?'})`}
                          {order.waiterInfo ? ` · ${order.waiterInfo}` : ''}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${age > 10 ? 'bg-danger-400/15 text-danger-400' : age > 5 ? 'bg-accent-400/15 text-accent-400' : 'bg-success-400/15 text-success-400'}`}>{age}m</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                      {order.items.map((item: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="flex justify-between font-medium text-surface-600">
                            <span>{item.quantity}× {item.productVariant.product.name}</span>
                            <span className="text-surface-400">({item.productVariant.name})</span>
                          </div>
                          {item.modifiers.length > 0 && (
                            <div className="mt-0.5 pl-3 text-[10px] text-surface-400 space-y-0.5">
                              {item.modifiers.map((m: any, mi: number) => <div key={mi}>+ {m.modifier.name}</div>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-3 border-t border-surface-200/50 bg-surface-100/40 flex gap-2 shrink-0">
                      <button onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')} className="flex-1 py-1.5 bg-success-500 hover:bg-success-600 text-white font-medium text-xs  uppercase tracking-wide transition">Mark Ready</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'PAID_ORDERS' && (
        <div className="flex-1 p-5 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-5 shrink-0">
            <h2 className="text-base font-semibold text-surface-700">Paid Orders History</h2>
            <button onClick={fetchPaidOrders} className={btnSecondary}>Refresh</button>
          </div>
          <div className="bg-surface-100 border border-surface-200  overflow-hidden shadow-card flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-50 border-b border-surface-200 text-surface-400 font-medium uppercase tracking-wider text-xs sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3">Order ID</th>
                  <th className="px-5 py-3 select-none">
                    <button onClick={() => cycleSort('createdAt')} className="flex items-center gap-1 hover:text-surface-600 font-semibold focus:outline-none transition">
                      Placed At {sortField === 'createdAt' ? (sortDirection === 'asc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="px-5 py-3 select-none">
                    <div className="flex items-center gap-2">
                      <button onClick={() => cycleSort('orderType')} className="flex items-center gap-1 hover:text-surface-600 font-semibold focus:outline-none transition">
                        Channel {sortField === 'orderType' ? (sortDirection === 'asc' ? '↓' : '↑') : '↕'}
                      </button>
                      <select value={channelFilter} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onChange={e => setChannelFilter(e.target.value as any)}
                        className="bg-surface-100 border border-surface-300 rounded px-1.5 py-0.5 text-[9px] text-surface-500 font-medium uppercase tracking-wider cursor-pointer focus:outline-none focus:border-brand-500 transition">
                        <option value="ALL">All</option>
                        <option value="DINE_IN">Dine In</option>
                        <option value="TAKE_AWAY">Take Away</option>
                        <option value="DELIVERY">Delivery</option>
                      </select>
                    </div>
                  </th>
                  <th className="px-5 py-3 select-none">
                    <button onClick={() => cycleSort('paymentMethod')} className="flex items-center gap-1 hover:text-surface-600 font-semibold focus:outline-none transition">
                      Payment {sortField === 'paymentMethod' ? (sortDirection === 'asc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th className="px-5 py-3">Cashout</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {processedPaidOrders.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-surface-400 text-sm">No paid orders found.</td></tr>
                ) : processedPaidOrders.map(order => {
                  let channel = 'Take Away';
                  if (order.orderType === 'DINE_IN') channel = `Dine In · T${order.tableNumber || 'N/A'} · ${order.waiterInfo || 'N/A'}`;
                  else if (order.orderType === 'DELIVERY') channel = `Delivery (${order.deliveryPlatform || 'N/A'}) · ${order.customerName || 'N/A'}`;
                  return (
                    <tr key={order.id} onClick={() => setSelectedHistoryOrder(order)} className="hover:bg-brand-500/5 cursor-pointer transition">
                      <td className="px-5 py-3 font-medium text-brand-400">{order.orderNumber}</td>
                      <td className="px-5 py-3 text-surface-500">{new Date(order.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-3 text-surface-500 max-w-xs truncate" title={channel}>{channel}</td>
                      <td className="px-5 py-3 text-surface-500 font-medium">{order.paymentMethod}</td>
                      <td className="px-5 py-3 text-surface-500">{new Date(order.updatedAt).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-semibold text-success-400">{Number(order.total).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          SYSTEM ADMIN PANEL (SLIDE-OUT)
      ════════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════
          SYSTEM ADMIN PANEL (FULL WIDTH TAB)
      ════════════════════════════════════════════════════ */}
      {activeTab === 'ADMIN' && (
        <div className="flex-1 p-5 flex flex-col overflow-hidden bg-surface-50/50">
          <div className="flex-1 bg-surface-100 border border-surface-200  shadow-card-lg flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-surface-200 flex justify-between items-center shrink-0 bg-surface-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8  bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-brand-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-surface-700">System Admin</h2>
                  <p className="text-[10px] text-surface-400 font-medium">Day active · {activeBusinessDay ? new Date(activeBusinessDay.openedAt).toLocaleString() : '—'}</p>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 px-4 py-2.5 border-b border-surface-200 bg-surface-50 shrink-0 overflow-x-auto scrollbar-none">
              {([
                { key: 'shift', icon: Users, label: 'Shift' },
                { key: 'day', icon: Calendar, label: 'Business Day' },
                { key: 'daily-report', icon: BarChart2, label: 'Daily Report' },
                { key: 'item-report', icon: Package, label: 'Item Report' },
                { key: 'shift-report', icon: TrendingUp, label: 'Shift Report' },
                { key: 'settings', icon: Settings, label: 'Settings' },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => setAdminTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5  text-xs font-medium whitespace-nowrap transition ${adminTab === key ? 'bg-brand-500 text-white' : 'text-surface-500 hover:bg-surface-200 hover:text-surface-600'}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">

              {/* ── SHIFT TAB ── */}
              {adminTab === 'shift' && (
                <div className="space-y-4">
                  <div className="bg-surface-50 border border-surface-200 p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Current Shift</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${activeShift ? 'bg-success-100/20 text-success-400 border border-success-400/20' : 'bg-surface-200 text-surface-500'}`}>
                        {activeShift ? 'Active' : 'Closed'}
                      </span>
                    </div>
                    {activeShift ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            ['Employee', activeShift.employeeName],
                            ['Opened At', new Date(activeShift.openedAt).toLocaleTimeString()],
                            ['Cash Sales', `${activeShift.cashSales.toFixed(2)}`],
                            ['Card Sales', `${activeShift.cardSales.toFixed(2)}`],
                            ['Opening Cash', `${activeShift.openingBalance.toFixed(2)}`],
                            ['Expected Drawer', `${(activeShift.openingBalance + activeShift.cashSales).toFixed(2)}`],
                          ].map(([l, v]) => (
                            <div key={l} className="bg-surface-100 p-3  border border-surface-200">
                              <span className="text-[10px] text-surface-400 uppercase tracking-wider block">{l}</span>
                              <span className="text-sm font-semibold text-surface-600 mt-0.5 block">{v}</span>
                            </div>
                          ))}
                        </div>

                        {!isClosingShift ? (
                          <div className="flex gap-2 pt-1">
                            <button onClick={async () => {
                              if (unpaidOrders.length > 0) { showUiToast(`Cannot close shift. ${unpaidOrders.length} unpaid order(s) pending.`, 'error'); return; }
                              setIsHandover(false);
                              setIsClosingShift(true);
                              setClosingCash('');
                            }} className="flex-1 py-2.5 bg-danger-500 hover:bg-danger-600 text-white font-medium text-xs  transition flex items-center justify-center gap-1.5">
                              <LogOut className="w-3.5 h-3.5" /> End Shift
                            </button>
                            <button onClick={async () => {
                              if (unpaidOrders.length > 0) { showUiToast(`Cannot handover shift. ${unpaidOrders.length} unpaid order(s) pending.`, 'error'); return; }
                              setIsHandover(true);
                              setIsClosingShift(true);
                              setClosingCash('');
                            }} className="flex-1 py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-medium text-xs  transition flex items-center justify-center gap-1.5">
                              <ArrowRight className="w-3.5 h-3.5" /> Handover Shift
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleCloseShift} className="space-y-3 pt-2 border-t border-surface-200">
                            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                              {isHandover ? '🔄 Shift Handover — Count Cash' : '🔒 End Shift — Count Cash'}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-surface-500 mb-1.5">Actual Cash Counted ()</label>
                              <input type="number" step="0.01" required value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="0.00" className={inputCls} autoFocus />
                            </div>
                            {closingCash && (
                              <div className="flex justify-between items-center bg-surface-100 border border-surface-200 p-3 ">
                                <span className="text-sm text-surface-500">Variance</span>
                                <span className={`text-lg font-semibold ${Math.abs(parseFloat(closingCash) - (activeShift.openingBalance + activeShift.cashSales)) < 0.01 ? 'text-success-400' : 'text-danger-400'}`}>
                                  {(parseFloat(closingCash) - (activeShift.openingBalance + activeShift.cashSales)).toFixed(2)}
                                </span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button type="button" onClick={() => { setIsClosingShift(false); setClosingCash(''); setIsHandover(false); }} className={`flex-1 ${btnSecondary}`}>Cancel</button>
                              <button type="submit" className={`flex-[2] py-2.5 ${isHandover ? 'bg-accent-500 hover:bg-accent-600' : 'bg-danger-500 hover:bg-danger-600'} text-white font-medium text-sm  tracking-wide transition`}>
                                {isHandover ? 'Confirm Handover' : 'Confirm Close Shift'}
                              </button>
                            </div>
                          </form>
                        )}
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-surface-400 font-medium">No active shift register. Start a shift to open the register drawer.</p>
                        {!activeBusinessDay ? (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium ">
                            Please start the Business Day first before starting a shift.
                          </div>
                        ) : !loggedInEmployee ? (
                          <div className="bg-surface-100 border border-surface-200  p-5 space-y-4 max-w-sm mx-auto">
                            <div className="text-center space-y-1">
                              <h2 className="text-xs font-semibold text-surface-600">Employee PIN Required</h2>
                              <p className="text-[10px] text-surface-400">Enter your 4-digit employee PIN to identify</p>
                            </div>
                            <div className="flex justify-center gap-2.5 py-1">
                              {[0, 1, 2, 3].map(i => (
                                <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${i < loginPin.length ? 'bg-brand-500 border-brand-500 scale-110' : 'bg-transparent border-surface-400'}`} />
                              ))}
                            </div>
                            {loginError && (
                              <div className="text-center text-[10px] text-danger-400 font-medium bg-danger-50 border border-danger-100 py-1.5 px-3 ">
                                {loginError}
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-1.5">
                              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                                <button key={i} type="button"
                                  onClick={() => d === '⌫' ? handlePinDelete() : d !== '' ? handlePinDigit(d) : undefined}
                                  disabled={loginLoading || d === ''}
                                  className={`h-10 font-semibold text-xs transition active:scale-95 ${d === '⌫' ? 'bg-surface-200 border border-surface-300 text-surface-500 hover:bg-surface-300' : d === '' ? 'invisible' : 'bg-surface-50 border border-surface-300 text-surface-600 hover:bg-surface-200 hover:text-surface-700'} disabled:cursor-not-allowed`}>
                                  {d === '⌫' ? <Delete className="w-3.5 h-3.5 mx-auto" /> : d}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 pt-2 border-t border-surface-200 max-w-sm mx-auto">
                            <div className="bg-brand-500/5 border border-brand-500/10  p-3 text-center mb-3">
                              <span className="text-[10px] text-surface-400 block uppercase tracking-wider">Identified Employee</span>
                              <span className="text-sm font-semibold text-brand-500 block mt-0.5">{loggedInEmployee.name} ({loggedInEmployee.role})</span>
                              <button onClick={() => setLoggedInEmployee(null)} className="text-[10px] text-danger-400 hover:text-danger-500 font-medium mt-1 underline">Switch User</button>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-surface-500 mb-1.5">Opening Cash in Drawer ()</label>
                              <input type="number" step="0.01" min="0" value={adminOpeningBalance} onChange={e => setAdminOpeningBalance(e.target.value)} placeholder="e.g. 500.00" className={inputCls} />
                            </div>
                            <button onClick={handleOpenShiftFromAdmin} disabled={loginLoading}
                              className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold text-xs  shadow-brand transition">
                              {loginLoading ? 'Starting...' : 'Start Shift'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-surface-200">
                    <button onClick={handleQuitApp} className="w-full py-2 border border-surface-300 text-surface-500 hover:text-surface-600 hover:bg-surface-200 font-medium text-xs  transition">
                      Exit Application
                    </button>
                  </div>
                </div>
              )}

              {/* ── BUSINESS DAY TAB ── */}
              {adminTab === 'day' && (
                <div className="space-y-4">
                  <div className="bg-surface-50 border border-surface-200  p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Business Day</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${activeBusinessDay ? 'bg-success-100/20 text-success-400 border border-success-400/20' : 'bg-surface-200 text-surface-500'}`}>
                        {activeBusinessDay ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    {activeBusinessDay ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-surface-100 p-3  border border-surface-200">
                            <span className="text-[10px] text-surface-400 uppercase tracking-wider block">Opened At</span>
                            <span className="text-sm font-semibold text-surface-600 mt-0.5 block">{new Date(activeBusinessDay.openedAt).toLocaleString()}</span>
                          </div>
                          <div className="bg-surface-100 p-3  border border-surface-200">
                            <span className="text-[10px] text-surface-400 uppercase tracking-wider block">Shifts Today</span>
                            <span className="text-sm font-semibold text-surface-600 mt-0.5 block">{activeBusinessDay.shifts?.length || 0}</span>
                          </div>
                        </div>
                        <div className="space-y-2 pt-1">
                          <button disabled={!!activeShift} onClick={async () => {
                            const r = await fetch(`${apiUrl}/api/orders/unpaid`);
                            if (r.ok) {
                              const list = await r.json();
                              if (list.length > 0) { showUiToast(`Cannot end business day. ${list.length} unpaid order(s) pending.`, 'error'); return; }
                            }
                            if (confirm('Are you sure you want to end the business day? This action cannot be undone.')) handleCloseBusinessDay();
                          }} className={`w-full py-2.5 font-medium text-xs transition ${!!activeShift ? 'bg-surface-200 text-surface-400 cursor-not-allowed' : 'bg-danger-500 hover:bg-danger-600 text-white'}`}>
                            End Business Day
                          </button>
                          {!!activeShift && <p className="text-[10px] text-danger-400 font-medium text-center">Close the active shift first before ending the business day.</p>}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <p className="text-xs text-surface-400">Business day register is currently closed.</p>
                        <button onClick={handleStartBusinessDay}
                          className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold text-xs  shadow-brand transition flex items-center justify-center gap-1.5">
                          <Sun className="w-3.5 h-3.5" /> Start Business Day
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── DAILY REPORT TAB ── */}
              {adminTab === 'daily-report' && (
                <div className="space-y-5">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-surface-700">Daily Sale Report</h3>
                    <button onClick={fetchDailyReport} className={btnSecondary}>Refresh</button>
                  </div>
                  {reportLoading ? (
                    <div className="text-center py-10 text-surface-400 text-sm">Loading report…</div>
                  ) : dailyReport ? (
                    <>
                      {/* Summary cards */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Total Sale', value: `${dailyReport.totalSale?.toFixed(2) || '0.00'}`, color: 'text-brand-400', bg: 'bg-brand-500/8 border-brand-500/20' },
                          { label: 'Orders', value: dailyReport.orderCount || 0, color: 'text-surface-600', bg: 'bg-surface-50 border-surface-200' },
                          { label: 'Cash', value: `${dailyReport.cashSale?.toFixed(2) || '0.00'}`, color: 'text-success-400', bg: 'bg-success-500/8 border-success-500/20' },
                          { label: 'Card', value: `${dailyReport.cardSale?.toFixed(2) || '0.00'}`, color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/20' },
                          { label: 'Dine In', value: `${dailyReport.dineInSale?.toFixed(2) || '0.00'}`, color: 'text-surface-600', bg: 'bg-surface-50 border-surface-200' },
                          { label: 'Take Away', value: `${dailyReport.takeAwaySale?.toFixed(2) || '0.00'}`, color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/20' },
                          { label: 'Delivery (Total)', value: `${dailyReport.deliverySale?.toFixed(2) || '0.00'}`, color: 'text-pink-400', bg: 'bg-pink-500/8 border-pink-500/20' },
                          { label: 'Tax Collected', value: `${dailyReport.totalTax?.toFixed(2) || '0.00'}`, color: 'text-surface-500', bg: 'bg-surface-50 border-surface-200' },
                        ].map(({ label, value, color, bg }) => (
                          <div key={label} className={`p-3  border ${bg}`}>
                            <span className="text-[10px] text-surface-400 uppercase tracking-wider block">{label}</span>
                            <span className={`text-base font-semibold mt-0.5 block ${color}`}>{value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Delivery sub-channel breakdown */}
                      {dailyReport.deliveryByPlatform && Object.keys(dailyReport.deliveryByPlatform).length > 0 && (
                        <div className="bg-surface-50 border border-surface-200  p-4 space-y-2">
                          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Delivery by Channel</span>
                          <div className="space-y-2 mt-2">
                            {Object.entries(dailyReport.deliveryByPlatform).map(([platform, amount]) => (
                              <div key={platform} className="flex justify-between items-center text-xs">
                                <span className="text-surface-500 font-medium">{platform === 'FOODPANDA' ? '🐼 Foodpanda' : platform === 'Local Driver' ? '🚗 Uber Eats' : '📦 Other'}</span>
                                <span className="font-semibold text-surface-600">{(amount as number).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pie charts */}
                      <div className="space-y-4">
                        <div className="bg-surface-50 border border-surface-200  p-4">
                          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider block mb-3">Sales by Channel</span>
                          <PieChart data={[
                            { label: 'Dine In', value: dailyReport.dineInSale || 0, color: '#6366f1' },
                            { label: 'Take Away', value: dailyReport.takeAwaySale || 0, color: '#f59e0b' },
                            { label: 'Delivery', value: dailyReport.deliverySale || 0, color: '#ec4899' },
                          ]} />
                        </div>
                        <div className="bg-surface-50 border border-surface-200  p-4">
                          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider block mb-3">Sales by Payment</span>
                          <PieChart data={[
                            { label: 'Cash', value: dailyReport.cashSale || 0, color: '#22c55e' },
                            { label: 'Card', value: dailyReport.cardSale || 0, color: '#3b82f6' },
                          ]} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10 text-surface-400 text-sm">No report data available.</div>
                  )}
                </div>
              )}

              {/* ── ITEM REPORT TAB (CATEGORY-ONLY) ── */}
              {adminTab === 'item-report' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-surface-700">Item-wise Sales Report</h3>
                    <button onClick={fetchItemReport} className={btnSecondary}>Refresh</button>
                  </div>
                  {reportLoading ? (
                    <div className="text-center py-10 text-surface-400 text-sm">Loading…</div>
                  ) : itemReport.length === 0 ? (
                    <div className="text-center py-10 text-surface-400 text-sm">No items sold yet.</div>
                  ) : itemReport.map(cat => (
                    <div key={cat.category} className="bg-surface-50 border border-surface-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-surface-100 flex justify-between items-center">
                        <span className="text-xs font-semibold text-surface-600">{cat.category}</span>
                        <div className="flex gap-3 text-[10px] text-surface-400 font-medium">
                          <span>{cat.totalQty} units</span>
                          <span className="text-success-400 font-semibold">{cat.totalRevenue.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── SHIFT REPORT TAB ── */}
              {adminTab === 'shift-report' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-surface-700">Shift-wise Report</h3>
                    <button onClick={fetchShiftReport} className={btnSecondary}>Refresh</button>
                  </div>
                  {reportLoading ? (
                    <div className="text-center py-10 text-surface-400 text-sm">Loading…</div>
                  ) : shiftReport.length === 0 ? (
                    <div className="text-center py-10 text-surface-400 text-sm">No shifts today.</div>
                  ) : shiftReport.map((shift: any) => (
                    <div key={shift.id} className="bg-surface-50 border border-surface-200  p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-semibold text-surface-700">{shift.employeeName}</p>
                          <p className="text-[10px] text-surface-400 mt-0.5">
                            {new Date(shift.openedAt).toLocaleTimeString()} → {shift.closedAt ? new Date(shift.closedAt).toLocaleTimeString() : 'Active'}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${shift.closedAt ? 'bg-surface-200 text-surface-500' : 'bg-success-100/20 text-success-400 border border-success-400/20'}`}>
                          {shift.closedAt ? 'Closed' : 'Active'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ['Cash Sales', `${shift.cashSales.toFixed(2)}`],
                          ['Card Sales', `${shift.cardSales.toFixed(2)}`],
                          ['Total Sales', `${shift.totalSales.toFixed(2)}`],
                          ['Opening Cash', `${shift.openingBalance.toFixed(2)}`],
                          ['Expected', shift.expectedCash != null ? `${shift.expectedCash.toFixed(2)}` : '—'],
                          ['Variance', shift.variance != null ? `${shift.variance.toFixed(2)}` : '—'],
                        ].map(([l, v]) => (
                          <div key={l} className="bg-surface-100 p-2.5  border border-surface-200">
                            <span className="text-[9px] text-surface-400 uppercase tracking-wider block">{l}</span>
                            <span className={`text-xs font-semibold mt-0.5 block ${l === 'Variance' && shift.variance != null ? (Math.abs(shift.variance) < 0.01 ? 'text-success-400' : 'text-danger-400') : 'text-surface-600'}`}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── SETTINGS TAB ── */}
              {adminTab === 'settings' && (
                <div className="space-y-4">
                  <div className="bg-surface-50 border border-surface-200 p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-surface-700 border-b border-surface-200 pb-2">System Information</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-1">
                        <span className="text-xs text-surface-500 font-medium">Application Version</span>
                        <span className="text-sm font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">v{appVersion}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-xs text-surface-500 font-medium">Cloud Server</span>
                        <span className="text-xs font-mono text-surface-600">{settings?.cloudUrl || 'Not Configured'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-xs text-surface-500 font-medium">Branch ID</span>
                        <span className="text-xs font-mono text-surface-600">{settings?.branchId}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-xs text-surface-500 font-medium">Terminal ID</span>
                        <span className="text-xs font-mono text-surface-600">{settings?.terminalId}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modifiers Modal */}
      {selectedProduct && <ModifiersModal product={selectedProduct} modifierGroups={modifierGroups} onClose={() => setSelectedProduct(null)} onAddToCart={handleAddToCart} />}

      {/* History Detail Modal */}
      {selectedHistoryOrder && (
        <div className={modalOverlay}>
          <div className={`${modalCard} max-w-md p-6 space-y-4`}>
            <div className={`${modalHeader} pb-3`}>
              <div><h3 className="text-base font-semibold text-surface-700">Order Detail</h3><p className="text-xs text-surface-400 mt-0.5">Historical receipt</p></div>
              <button onClick={() => setSelectedHistoryOrder(null)} className="text-surface-400 hover:text-surface-600 w-7 h-7 flex items-center justify-center  hover:bg-surface-200 transition text-lg">×</button>
            </div>
            <div className="bg-surface-50 border border-surface-200  p-4 space-y-2 text-xs">
              {[['Order #', selectedHistoryOrder.orderNumber], ['Placed At', new Date(selectedHistoryOrder.createdAt).toLocaleString()], ['Cashout', new Date(selectedHistoryOrder.updatedAt).toLocaleString()], ['Channel', selectedHistoryOrder.orderType]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-surface-400">{k}</span><span className="font-medium text-surface-600">{v}</span></div>
              ))}
              {selectedHistoryOrder.orderType === 'DINE_IN' && <><div className="flex justify-between"><span className="text-surface-400">Table</span><span className="font-medium text-surface-600">{selectedHistoryOrder.tableNumber || 'N/A'}</span></div><div className="flex justify-between"><span className="text-surface-400">Waiter</span><span className="font-medium text-surface-600">{selectedHistoryOrder.waiterInfo || 'N/A'}</span></div></>}
              {selectedHistoryOrder.orderType === 'DELIVERY' && <>
                <div className="flex justify-between"><span className="text-surface-400">Platform</span><span className="font-medium text-surface-600">{selectedHistoryOrder.deliveryPlatform || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-surface-400">Customer</span><span className="font-medium text-surface-600">{selectedHistoryOrder.customerName || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-surface-400">Phone</span><span className="font-medium text-surface-600">{selectedHistoryOrder.customerPhone || 'N/A'}</span></div>
              </>}
              <div className="flex justify-between border-t border-surface-200 pt-2"><span className="text-surface-400">Payment</span><span className="font-semibold text-brand-400">{selectedHistoryOrder.paymentMethod}</span></div>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar">
              {selectedHistoryOrder.items?.map((item: any) => (
                <div key={item.id} className="p-2.5 bg-surface-50 border border-surface-200  text-xs flex justify-between items-start">
                  <div>
                    <p className="font-medium text-surface-600">{item.productVariant?.product?.name} ({item.productVariant?.name})</p>
                    <p className="text-[10px] text-surface-400 mt-0.5">{item.quantity} × {Number(item.unitPrice).toFixed(2)}{Number(item.unitPrice) === 0 && <span className="text-success-400 ml-1">(FREE)</span>}</p>
                  </div>
                  <span className="font-semibold text-surface-600">{(Number(item.unitPrice) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-surface-200 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-surface-400"><span>Subtotal</span><span>{Number(selectedHistoryOrder.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between text-surface-400"><span>Tax</span><span>{Number(selectedHistoryOrder.tax).toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-sm border-t border-surface-200 pt-1.5"><span className="text-surface-700">Total</span><span className="text-success-400">{Number(selectedHistoryOrder.total).toFixed(2)}</span></div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={async () => {
                await executePrintReceipt({ orderNumber: selectedHistoryOrder.orderNumber, dateTime: selectedHistoryOrder.createdAt, employeeName: activeShift?.employeeName || 'Staff', items: selectedHistoryOrder.items.map((item: any) => ({ name: `${item.productVariant?.product?.name} (${item.productVariant?.name})`, qty: item.quantity, price: Number(item.unitPrice), modifiers: item.modifiers?.map((m: any) => m.modifier?.name) || [] })), subtotal: Number(selectedHistoryOrder.subtotal), tax: Number(selectedHistoryOrder.tax), total: Number(selectedHistoryOrder.total), paymentMethod: selectedHistoryOrder.paymentMethod, orderType: selectedHistoryOrder.orderType, tableNumber: selectedHistoryOrder.tableNumber, waiterInfo: selectedHistoryOrder.waiterInfo, customerName: selectedHistoryOrder.customerName, customerPhone: selectedHistoryOrder.customerPhone, deliveryAddress: selectedHistoryOrder.deliveryAddress, taxRate: Number(selectedHistoryOrder.subtotal) > 0 ? Math.round((Number(selectedHistoryOrder.tax) / Number(selectedHistoryOrder.subtotal)) * 100) : 0 });
              }} className={`flex-1 ${btnPrimary}`}><Printer className="w-3.5 h-3.5 inline mr-1" />Reprint</button>
              <button onClick={() => { if (confirm('Reopen this paid order as pending?')) handleReopenOrder(selectedHistoryOrder.id); }} className="flex-1 py-2 bg-danger-500 hover:bg-danger-600 text-white font-medium text-xs tracking-wide transition">Reopen Order</button>
              <button onClick={() => setSelectedHistoryOrder(null)} className={`flex-1 ${btnSecondary}`}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className={modalOverlay}>
          <div className={`${modalCard} max-w-md p-6 space-y-5`}>
            {checkoutStep === 1 && (
              <>
                <div className={`${modalHeader} pb-3`}>
                  <h3 className="text-base font-semibold text-surface-700">Payment Method</h3>
                  <span className="text-xl font-semibold text-brand-400">{total.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[{ m: 'CASH' as const, Icon: Banknote, label: 'Cash' }, { m: 'CARD' as const, Icon: CreditCard, label: 'Card' }].map(({ m, Icon, label }) => (
                    <button key={m} onClick={() => setPaymentMethod(m)}
                      className={`py-6 border-2 font-medium flex flex-col items-center gap-3 transition ${paymentMethod === m ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/40'}`}>
                      <Icon className="w-8 h-8" /><span className="text-xs">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setIsCheckoutOpen(false); setCashReceived(''); }} className={`flex-1 ${btnSecondary}`}>Cancel</button>
                  <button onClick={() => setCheckoutStep(2)} className={`flex-1 ${btnPrimary}`}>Next <ChevronRight className="w-3.5 h-3.5 inline" /></button>
                </div>
              </>
            )}
            {checkoutStep === 2 && (
              <>
                <div className={`${modalHeader} pb-3`}>
                  <h3 className="text-base font-semibold text-surface-700">Confirm Payment</h3>
                  <span className="text-xl font-semibold text-brand-400">{total.toFixed(2)}</span>
                </div>
                {paymentMethod === 'CASH' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-surface-500 mb-1.5">Cash Tendered</label>
                      <input type="number" step="0.01" autoFocus value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder="Enter amount received" className={inputCls} />
                    </div>
                    {parseFloat(cashReceived) >= total ? (
                      <div className="flex justify-between items-center bg-success-100/10 border border-success-400/20 p-2.5 ">
                        <span className="text-xs text-surface-500">Change Due</span>
                        <span className="text-xl font-semibold text-success-400">{(parseFloat(cashReceived) - total).toFixed(2)}</span>
                      </div>
                    ) : cashReceived && parseFloat(cashReceived) < total ? (
                      <p className="text-xs text-danger-400 font-medium">Amount is less than total.</p>
                    ) : null}

                    {/* Touchscreen Numeric Keypad & Quick Cash Options */}
                    <div className="space-y-2 pt-1 border-t border-surface-200">
                      {/* Row 1 Quick Cash */}
                      <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
                        <button type="button" onClick={() => setCashReceived(total.toFixed(2))} className="py-2  bg-brand-500/10 border border-brand-500/25 text-brand-400 hover:bg-brand-500/20 transition">Exact</button>
                        {/* {[5, 10, 20].map(val => (
                          <button key={val} type="button" onClick={() => setCashReceived(val.toFixed(2))} className="py-2 rounded-lg bg-surface-200 border border-surface-300 text-surface-600 hover:bg-surface-300 transition">{val}</button>
                        ))} */}
                      </div>
                      {/* Row 2 Quick Cash */}
                      {/* <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
                        {[50, 100].map(val => (
                          <button key={val} type="button" onClick={() => setCashReceived(val.toFixed(2))} className="py-2 rounded-lg bg-surface-200 border border-surface-300 text-surface-600 hover:bg-surface-300 transition">{val}</button>
                        ))}
                        <button type="button" onClick={() => {
                          const nextVal = (Math.ceil(total / 5) * 5);
                          setCashReceived(nextVal.toFixed(2));
                        }} className="py-2 rounded-lg bg-surface-200 border border-surface-300 text-surface-600 hover:bg-surface-300 transition text-[10px]" title="Round up to nearest $5">500</button>
                        <button type="button" onClick={() => {
                          const nextVal = (Math.ceil(total / 10) * 10);
                          setCashReceived(nextVal.toFixed(2));
                        }} className="py-2 rounded-lg bg-surface-200 border border-surface-300 text-surface-600 hover:bg-surface-300 transition text-[10px]" title="Round up to nearest $10">1000</button>
                      </div> */}

                      {/* Numeric Keypad Grid */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-surface-100">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((d) => (
                          <button key={d} type="button"
                            onClick={() => {
                              if (d === '⌫') handleCashDelete();
                              else handleCashDigit(d);
                            }}
                            className="h-10 font-bold text-xs bg-surface-50 border border-surface-300 text-surface-600 hover:bg-surface-200 hover:text-surface-700 transition active:scale-95 flex items-center justify-center">
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {paymentMethod === 'CARD' && (
                  <div className="p-8 text-center border border-dashed border-surface-300 bg-surface-50">
                    <CreditCard className="w-10 h-10 stroke-[1.5] mx-auto mb-2 text-surface-400" />
                    <p className="text-xs font-medium text-surface-500">Process {total.toFixed(2)} on terminal</p>
                  </div>
                )}
                <div className="pt-2 border-t border-surface-200">
                  <label className="flex items-center gap-2 cursor-pointer select-none py-1 text-xs font-medium text-surface-600 hover:text-surface-700">
                    <input
                      type="checkbox"
                      checked={skipPrintReceipt}
                      onChange={e => setSkipPrintReceipt(e.target.checked)}
                      className="w-4 h-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500/30 accent-brand-500 cursor-pointer"
                    />
                    <span>Do not print receipt slip</span>
                  </label>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setCheckoutStep(1)} className={`flex-1 ${btnSecondary}`}>Back</button>
                  <button disabled={isSubmitting || (paymentMethod === 'CASH' && (!cashReceived || parseFloat(cashReceived) < total))} onClick={() => submitOrder('PAID')}
                    className={`flex-[2] py-2.5 text-sm font-medium transition flex items-center justify-center gap-2 ${!isSubmitting && (paymentMethod === 'CARD' || (paymentMethod === 'CASH' && parseFloat(cashReceived) >= total)) ? 'bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.98] shadow-brand' : 'bg-surface-200 text-surface-400 cursor-not-allowed'}`}>
                    {skipPrintReceipt ? <Check className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
                    {skipPrintReceipt ? 'Complete Order (No Print)' : 'Complete & Print'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {isDiscountOpen && (
        <div className={modalOverlay}>
          <div className={`${modalCard} max-w-md p-6 space-y-4`}>
            {discountFlowStep === 'CHOOSE' && (
              <>
                <div className={`${modalHeader} pb-3`}>
                  <div><h3 className="text-base font-semibold text-surface-700">Apply Discount</h3><p className="text-xs text-surface-400 mt-0.5">Choose discount type to apply.</p></div>
                  <button onClick={() => setIsDiscountOpen(false)} className="text-surface-400 hover:text-surface-600 w-7 h-7 flex items-center justify-center hover:bg-surface-200 transition text-lg">×</button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[{ step: 'INDIVIDUAL' as const, title: 'Individual Item Discount', desc: 'Apply discount to specific cart items.' }, { step: 'FULL' as const, title: 'Full Order Discount', desc: 'Apply a flat or % discount to the whole order.' }].map(({ step, title, desc }) => (
                    <button key={step} type="button" onClick={() => setDiscountFlowStep(step)}
                      className="flex items-center gap-4 p-4  border border-surface-300 bg-surface-50 hover:bg-brand-500/5 hover:border-brand-500/30 transition text-left group">
                      <div className="p-2.5 bg-surface-100 border border-surface-200 text-brand-500 group-hover:bg-brand-500/10 transition"><Award className="w-5 h-5" /></div>
                      <div className="flex-1"><h4 className="text-sm font-medium text-surface-600 group-hover:text-brand-400 transition">{title}</h4><p className="text-xs text-surface-400 mt-0.5">{desc}</p></div>
                      <ChevronRight className="w-4 h-4 text-surface-400 group-hover:text-brand-500 transition" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {discountFlowStep === 'INDIVIDUAL' && (
              <>
                <div className={`${modalHeader} pb-3`}>
                  <div><h3 className="text-base font-semibold text-surface-700">Item Discount</h3><p className="text-xs text-surface-400 mt-0.5">Select items then apply discount.</p></div>
                  <button onClick={() => setDiscountFlowStep('CHOOSE')} className="text-xs text-surface-500 hover:text-brand-400 bg-surface-200 border border-surface-300 px-2.5 py-1  transition">← Back</button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
                    <span>Items ({selectedIndividualItemIds.length} selected)</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedIndividualItemIds(cart.map(i => i.id))} className="hover:text-brand-400 transition">All</button>
                      <span className="opacity-30">|</span>
                      <button type="button" onClick={() => setSelectedIndividualItemIds([])} className="hover:text-brand-400 transition">None</button>
                    </div>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 custom-scrollbar">
                    {cart.map(item => {
                      const checked = selectedIndividualItemIds.includes(item.id);
                      let cost = item.unitPrice; item.modifiers.forEach(m => cost += m.price);
                      return (
                        <label key={item.id} className={`flex items-center gap-2.5 p-2.5 cursor-pointer border transition ${checked ? 'bg-brand-500/10 border-brand-500/40 text-brand-400' : 'bg-surface-50 border-surface-200 text-surface-500 hover:bg-surface-100'}`}>
                          <input type="checkbox" checked={checked} onChange={() => setSelectedIndividualItemIds(checked ? selectedIndividualItemIds.filter(id => id !== item.id) : [...selectedIndividualItemIds, item.id])} className="rounded text-brand-500 bg-surface-100 border-surface-300" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{item.productName} ({item.variantName})</p>
                            <p className="text-[10px] text-surface-400 mt-0.5">{cost.toFixed(2)} × {item.quantity} = {(cost * item.quantity).toFixed(2)}{item.discount && <span className="text-success-400 ml-1">[{item.discount.name}]</span>}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {renderPromoForm()}
              </>
            )}
            {discountFlowStep === 'FULL' && (
              <>
                <div className={`${modalHeader} pb-3`}>
                  <div><h3 className="text-base font-semibold text-surface-700">Order Discount</h3><p className="text-xs text-surface-400 mt-0.5">Applies to entire order subtotal.</p></div>
                  <button onClick={() => setDiscountFlowStep('CHOOSE')} className="text-xs text-surface-500 hover:text-brand-400 bg-surface-200 border border-surface-300 px-2.5 py-1  transition">← Back</button>
                </div>
                {renderPromoForm()}
              </>
            )}
            <div className="border-t border-surface-200 pt-2">
              <button onClick={() => { setCustomDiscountValue(''); setCustomDiscountName(''); setIsDiscountOpen(false); }} className={`w-full py-2.5 ${btnSecondary}`}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Update Details Modal */}
      {isUpdateDetailsOpen && (
        <div className={modalOverlay}>
          <div className={`${modalCard} max-w-md p-6 space-y-5`}>
            <div className={`${modalHeader} pb-3`}>
              <div><h3 className="text-base font-semibold text-surface-700">Update Order Details</h3><p className="text-xs text-surface-400 mt-0.5">Modify channel, table, or delivery info.</p></div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(['DINE_IN', 'TAKE_AWAY', 'DELIVERY'] as const).map(type => (
                  <button key={type} type="button" onClick={() => setTempOrderType(type)}
                    className={`py-2  border-2 font-medium text-xs transition ${tempOrderType === type ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-surface-50 border-surface-300 text-surface-500 hover:border-brand-500/30'}`}>
                    {type === 'DINE_IN' ? 'Dine In' : type === 'TAKE_AWAY' ? 'Take Away' : 'Delivery'}
                  </button>
                ))}
              </div>
              {tempOrderType !== 'DELIVERY' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[10px] font-medium text-surface-400 mb-1">Waiter</label><select value={tempWaiterInfo} onChange={e => setTempWaiterInfo(e.target.value)} className={selectCls}><option value="">{waitersList.length === 0 ? 'No Waiters' : 'Select'}</option>{waitersList.map((w: string) => <option key={w} value={w}>{w}</option>)}</select></div>
                  <div><label className="block text-[10px] font-medium text-surface-400 mb-1">Table #</label><input type="text" value={tempTableNumber} onChange={e => setTempTableNumber(e.target.value)} placeholder="Table #" className={inputCls} /></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={tempCustomerName} onChange={e => setTempCustomerName(e.target.value)} placeholder="Customer Name" className={inputCls} />
                    <select value={tempDeliveryPlatform} onChange={e => setTempDeliveryPlatform(e.target.value)} className={selectCls}>
                      <option value="FOODPANDA">Foodpanda</option>
                      <option value="UBER_EATS">Uber Eats</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={tempCustomerPhone} onChange={e => setTempCustomerPhone(e.target.value)} placeholder="Phone" className={inputCls} />
                    <input type="text" value={tempDeliveryAddress} onChange={e => setTempDeliveryAddress(e.target.value)} placeholder="Address" className={inputCls} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsUpdateDetailsOpen(false)} className={`flex-1 ${btnSecondary}`}>Cancel</button>
              <button type="button" onClick={handleSaveDetails} className={`flex-[2] ${btnPrimary}`}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Due Modal */}
      {showChangeModal && (
        <div onClick={() => setShowChangeModal(false)} className={`${modalOverlay} cursor-pointer`}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-xs bg-surface-100 border border-surface-200 shadow-card-lg p-8 text-center space-y-5 cursor-default">
            <div className="mx-auto w-16 h-16  bg-success-100/20 border border-success-400/20 flex items-center justify-center shadow-glow">
              <Banknote className="w-8 h-8 text-success-400" />
            </div>
            <div>
              <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider">Change Due</h3>
              <p className="text-4xl font-semibold text-success-400 mt-2">{changeToReturn.toFixed(2)}</p>
            </div>
            <button onClick={() => setShowChangeModal(false)} className={`w-full py-2.5 ${btnPrimary}`}>Close</button>
          </div>
        </div>
      )}

      {/* Real-time Print Toast Notification */}
      {printToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4.5 py-3.5  shadow-2xl border bg-surface-100 border-surface-200 text-surface-700 animate-bounce">
          <div className={`p-2  ${printToast.type === 'info' ? 'bg-amber-500/10 text-amber-500' :
            printToast.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
              'bg-rose-500/10 text-rose-500'
            }`}>
            {printToast.type === 'info' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          </div>
          <div className="text-xs font-semibold">
            {printToast.msg}
          </div>
        </div>
      )}

      {/* Admin PIN Authorization Modal */}
      {isAuthModalOpen && (
        <div className={modalOverlay}>
          <div className={`${modalCard} max-w-sm p-6 space-y-5`}>
            <div className="text-center space-y-1">
              <h3 className="text-base font-semibold text-surface-700">Admin Authorization</h3>
              <p className="text-xs text-surface-400 font-medium">
                {authReasonRequired ? 'Enter deletion reason & 4-digit Manager PIN' : 'Enter 4-digit Manager PIN to continue'}
              </p>
            </div>

            {authReasonRequired && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Reason for Deletion</label>
                <input
                  type="text"
                  required
                  value={authReason}
                  onChange={e => {
                    setAuthReason(e.target.value);
                    if (e.target.value.trim()) {
                      setAuthError('');
                    }
                  }}
                  placeholder="e.g. Customer changed mind, Entry mistake"
                  className={inputCls}
                  autoFocus
                />
              </div>
            )}

            {/* PIN dots display */}
            <div className="flex justify-center gap-3 py-1">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${i < authPin.length ? 'bg-brand-500 border-brand-500 scale-110' : 'bg-transparent border-surface-400'}`} />
              ))}
            </div>

            {authError && (
              <div className="text-center text-xs text-danger-400 font-medium bg-danger-50 border border-danger-100 py-1.5 px-3 ">
                {authError}
              </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-surface-200">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                <button key={i} type="button"
                  onClick={() => d === '⌫' ? handleAuthDelete() : d !== '' ? handleAuthDigit(d) : undefined}
                  className={`h-11  font-semibold text-xs transition active:scale-95 ${d === '⌫' ? 'bg-surface-200 border border-surface-300 text-surface-500 hover:bg-surface-300' : d === '' ? 'invisible' : 'bg-surface-50 border border-surface-300 text-surface-600 hover:bg-surface-200 hover:text-surface-700'}`}>
                  {d === '⌫' ? <Delete className="w-4 h-4 mx-auto" /> : d}
                </button>
              ))}
            </div>

            <button type="button" onClick={() => setIsAuthModalOpen(false)} className={`w-full py-2.5 ${btnSecondary}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Browser Print Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm h-[85vh] flex flex-col shadow-2xl relative rounded-xl overflow-hidden border border-surface-200">
            <div className="flex justify-between items-center px-4 py-3 border-b bg-surface-50">
              <div>
                <h3 className="font-bold text-sm text-surface-800 uppercase tracking-wider">Print Preview</h3>
                <p className="text-[10px] text-surface-500 font-medium">Browser Testing Mode</p>
              </div>
              <button onClick={() => setPreviewHtml(null)} className="text-surface-500 hover:text-danger-600 hover:bg-danger-50 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-surface-100 p-4 flex justify-center custom-scroll">
              <div className="bg-white shadow-md border border-surface-200 flex-shrink-0" style={{ width: '80mm', height: 'fit-content', minHeight: '200px' }}>
                <iframe srcDoc={previewHtml} className="w-full min-h-[500px] border-none outline-none" onLoad={(e) => {
                  const iframe = e.target as HTMLIFrameElement;
                  if (iframe.contentWindow?.document.body) {
                    iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 50 + 'px';
                  }
                }} />
              </div>
            </div>
            <div className="p-3 border-t bg-surface-50 flex gap-2">
              <button onClick={() => setPreviewHtml(null)} className={`flex-1 py-2 ${btnSecondary}`}>Close Preview</button>
            </div>
          </div>
        </div>
      )}

      {/* Void Bill Confirm Modal */}
      {voidConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-surface-900 text-center">Void This Bill?</h3>
            <p className="text-sm text-surface-500 text-center">This will set the bill to 0 Rs and move it to History. This action cannot be undone.</p>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setVoidConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmVoidBill}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Yes, Void Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Ready Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4 border border-brand-200">
            <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center animate-bounce">
              <Download className="w-7 h-7 text-brand-600" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-surface-900">Update Ready to Install!</h3>
              <p className="text-sm text-surface-500">A new version of the POS has been downloaded in the background.</p>
            </div>
            
            <div className="w-full bg-surface-50 border border-surface-200 rounded p-3 text-center mb-1">
              <p className="text-xs text-surface-600">Installing will restart the application immediately. Please ensure you are not in the middle of a transaction.</p>
            </div>

            <div className="flex flex-col gap-2 w-full mt-2">
              <button
                onClick={() => { (window as any).electronAPI.restartAndInstall(); }}
                className="w-full py-3 rounded-lg bg-brand-500 text-white text-sm font-bold hover:bg-brand-600 transition-colors shadow-md"
              >
                Install Now & Restart
              </button>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="w-full py-2 rounded-lg border border-surface-200 text-surface-600 text-sm font-medium hover:bg-surface-100 transition-colors"
              >
                Remind Me Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
