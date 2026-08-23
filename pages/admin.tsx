import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  LayoutDashboard,
  BarChart2,
  FileText,
  Clipboard,
  Package,
  Briefcase,
  Users,
  Settings,
  Sun,
  Moon,
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  PlusCircle,
  Download,
  RefreshCw,
  AlertTriangle,
  DollarSign,
  Calendar,
  ChevronDown,
  Image,
  X,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Info,
  Check,
  Percent,
  Edit
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES & SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────
interface Employee {
  pin: string;
  name: string;
  role: 'CASHIER' | 'MANAGER' | 'WAITER';
}

interface CategorySetting {
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  bgColor?: string;
  textColor?: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  description?: string;
  imageUrl?: string;
  status?: string;
  bgColor?: string;
  textColor?: string;
  variants: {
    id: string;
    name: string;
    price: number;
    sku: string;
  }[];
}

interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
}

interface InventoryItem {
  id: string;
  ingredientName: string;
  quantity: number;
  minThreshold: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  subtotal: number;
  tax: number;
  createdAt: string;
  orderType: string;
  tableNumber?: string;
  customerName?: string;
  waiterInfo?: string;
  deliveryPlatform?: string;
  items: {
    id: string;
    productVariantId: string;
    quantity: number;
    unitPrice: number;
    productVariant: {
      id: string;
      name: string;
      product: {
        name: string;
        category: string;
      }
    };
    modifiers: {
      modifier: {
        name: string;
      }
    }[];
  }[];
}

interface ShiftAudit {
  id: string;
  employeeName: string;
  employeePin: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  closingBalance: number | null;
  expectedCash: number | null;
  actualCash: number | null;
  cashSales: number;
  cardSales: number;
  totalSales: number;
  variance: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM DONUT CHART (SVG-based)
// ─────────────────────────────────────────────────────────────────────────────
interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

const DonutChart: React.FC<{ data: DonutSlice[]; isDark: boolean }> = ({ data, isDark }) => {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const radius = 50;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius; // ~314.16

  let accumulatedPercent = 0;

  const slices = useMemo(() => {
    return data.map((slice) => {
      const percent = total > 0 ? slice.value / total : 0;
      const strokeDashoffset = circumference - (percent * circumference);
      const rotationAngle = accumulatedPercent * 360;
      accumulatedPercent += percent;
      return {
        ...slice,
        percent,
        strokeDashoffset,
        rotationAngle
      };
    });
  }, [data, total, circumference]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 rounded-full border-4 border-dashed border-purple-500/20 flex items-center justify-center">
          <Info className="w-6 h-6 text-purple-400" />
        </div>
        <p className="text-xs text-purple-400/60 mt-3">No sales data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
      <div className="relative w-36 h-36">
        <svg width="100%" height="100%" viewBox="0 0 120 120" className="transform -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke={isDark ? '#221a3a' : '#eae5f7'}
            strokeWidth={strokeWidth}
          />
          {slices.map((slice, i) => (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={slice.strokeDashoffset}
              transform={`rotate(${slice.rotationAngle} 60 60)`}
              className="transition-all duration-500 ease-out"
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">Total</span>
          <span className="text-sm font-bold">{total.toFixed(0)}</span>
        </div>
      </div>

      <div className="space-y-2 flex-1 w-full max-w-[200px]">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
              <span className="font-medium truncate max-w-[100px]">{slice.label}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="font-semibold block">{slice.value.toFixed(1)}</span>
              <span className="text-[10px] opacity-60 block">{(slice.percent * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM INTERACTIVE BAR CHART (SVG-based)
// ─────────────────────────────────────────────────────────────────────────────
interface BarChartData {
  label: string;
  value: number;
}

const InteractiveBarChart: React.FC<{ data: BarChartData[]; isDark: boolean }> = ({ data, isDark }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxValue = useMemo(() => {
    const vals = data.map(d => d.value);
    return Math.max(...vals, 100); // minimum 100 for scale
  }, [data]);

  const height = 180;
  const width = 480;
  const padding = 30;

  const graphHeight = height - padding * 2;
  const graphWidth = width - padding * 2;

  const points = useMemo(() => {
    return data.map((item, idx) => {
      const x = padding + (idx * (graphWidth / (data.length - 1 || 1)));
      const y = height - padding - (item.value / maxValue) * graphHeight;
      return { x, y, label: item.label, value: item.value };
    });
  }, [data, maxValue, graphHeight, graphWidth, padding, height]);

  return (
    <div className="relative w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padding + (1 - ratio) * graphHeight;
          const gridVal = (ratio * maxValue).toFixed(0);
          return (
            <g key={idx} className="opacity-40">
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke={isDark ? '#2a224a' : '#e6e1f7'}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padding - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-current text-[9px] font-semibold"
              >
                {gridVal}
              </text>
            </g>
          );
        })}

        {/* Chart Bars */}
        {points.map((pt, idx) => {
          const barWidth = 24;
          const barHeight = height - padding - pt.y;
          const barX = pt.x - barWidth / 2;

          return (
            <g key={idx}>
              {/* Highlight background on hover */}
              <rect
                x={barX - 4}
                y={padding - 10}
                width={barWidth + 8}
                height={graphHeight + 20}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              />

              {/* The Actual Bar */}
              <rect
                x={barX}
                y={pt.y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx="4"
                fill={hoveredIndex === idx ? 'url(#purpleAccentGradient)' : 'url(#purpleBaseGradient)'}
                className="transition-all duration-300 ease-out cursor-pointer"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              />

              {/* Day Labels */}
              <text
                x={pt.x}
                y={height - 10}
                textAnchor="middle"
                className="fill-current text-[10px] font-semibold opacity-75"
              >
                {pt.label}
              </text>
            </g>
          );
        })}

        {/* Gradients */}
        <defs>
          <linearGradient id="purpleBaseGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="purpleAccentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="1" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Floating Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute z-20 pointer-events-none transition-all duration-150 transform -translate-x-1/2 bg-purple-950/95 border border-purple-500/40 text-purple-100 shadow-xl px-2.5 py-1.5 rounded-lg text-xs flex flex-col items-center"
          style={{
            left: `${(points[hoveredIndex].x / width) * 100}%`,
            top: `${(points[hoveredIndex].y / height) * 100 - 32}%`
          }}
        >
          <span className="font-bold">{points[hoveredIndex].value.toFixed(2)}</span>
          <span className="text-[9px] opacity-60 font-semibold">{points[hoveredIndex].label}</span>
          <div className="w-2 h-2 rotate-45 bg-purple-950 border-r border-b border-purple-500/40 absolute -bottom-1" />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();

  // Settings & Networking
  const [settings, setSettings] = useState<any>({
    isMaster: true,
    masterIp: '127.0.0.1',
    branchId: 'BR01',
    terminalId: 'T01',
    employees: []
  });
  const [apiUrl, setApiUrl] = useState('http://localhost:4000');

  // Page States
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(true);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    dashboard: true,
    settings: true
  });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('pos-theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Loaded DB data
  const [activeBusinessDay, setActiveBusinessDay] = useState<any>(null);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [shiftsList, setShiftsList] = useState<ShiftAudit[]>([]);
  const [categories, setCategories] = useState<CategorySetting[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', status: 'ACTIVE' as 'ACTIVE' | 'DISABLED', bgColor: '', textColor: '' });
  const [categoryError, setCategoryError] = useState('');
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<CategorySetting | null>(null);

  // Selected Order for Invoice view
  const [selectedInvoice, setSelectedInvoice] = useState<Order | null>(null);

  // Forms / Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ pin: '', name: '', role: 'CASHIER' as 'CASHIER' | 'MANAGER' | 'WAITER' });
  const [employeeError, setEmployeeError] = useState('');

  // Staff management states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [newStaff, setNewStaff] = useState({
    code: '',
    name: '',
    fatherName: '',
    role: 'Waiter',
    cnic: '',
    salary: '',
    status: 'ACTIVE'
  });
  const [staffError, setStaffError] = useState('');
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [showCustomRoleInput, setShowCustomRoleInput] = useState(false);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '', sku: '', status: 'ACTIVE', bgColor: '', textColor: '' });
  const [productError, setProductError] = useState('');

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: 'Rent', amount: '', description: '', date: '' });
  const [expenseError, setExpenseError] = useState('');

  // Shift & Register Handlers
  const [closingCash, setClosingCash] = useState('');
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [isHandover, setIsHandover] = useState(false);
  const [adminOpeningBalance, setAdminOpeningBalance] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [loading, setLoading] = useState<boolean>(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string) => {
    let type: 'success' | 'error' | 'info' = 'error';
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('success') || lowerMsg.includes('complete')) type = 'success';
    else if (lowerMsg.includes('sent')) type = 'info';

    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };


  // Admin Login States
  const [adminLoggedIn, setAdminLoggedIn] = useState<any>(null);
  const [adminLoginPin, setAdminLoginPin] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  // Dynamic Theme Mapping
  const isDark = theme === 'dark';
  const bgClass = isDark ? 'bg-[#09070f] text-[#e2e0f0]' : 'bg-[#f7f6fb] text-[#1a162b]';
  const cardClass = isDark ? 'bg-[#130f24] border-[#221a3a]' : 'bg-white border-[#e5e1f5] shadow-sm';
  const borderClass = isDark ? 'border-[#221a3a]' : 'border-[#e5e1f5]';
  const hoverClass = isDark ? 'hover:bg-[#1a1532]' : 'hover:bg-[#f2eefc]';
  const textMuted = isDark ? 'text-[#8d88a6]' : 'text-[#6e6988]';
  const inputClass = isDark
    ? 'bg-[#1c1634] border-[#312752] text-white focus:border-purple-500 placeholder-purple-400/30'
    : 'bg-white border-[#d2cce6] text-[#1a162b] focus:border-purple-600 placeholder-slate-400';

  const sidebarClass = isDark
    ? 'bg-[#0d0b16] border-[#221a3a] text-purple-200/90'
    : 'bg-white border-[#e5e1f5] text-[#475569]';

  const parentActiveCls = isDark
    ? 'bg-purple-600/20 border-l-2 border-purple-500 text-purple-200 font-semibold'
    : 'bg-blue-50 text-blue-600 font-bold border-l-2 border-blue-500';

  const parentHoverCls = isDark
    ? 'hover:bg-purple-900/10 text-purple-400 hover:text-purple-200'
    : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900';

  const subActiveCls = isDark
    ? 'bg-purple-600/15 text-purple-300 font-semibold'
    : 'bg-blue-50 text-blue-600 font-semibold';

  const subHoverCls = isDark
    ? 'hover:bg-purple-900/10 text-purple-400 hover:text-purple-300'
    : 'hover:bg-slate-50 text-slate-500 hover:text-slate-700';

  const groupTitleCls = isDark
    ? 'text-purple-500/50'
    : 'text-slate-400';

  interface SidebarSubItem {
    id: string;
    label: string;
    icon: any;
  }

  interface SidebarItem {
    id: string;
    label: string;
    icon: any;
    subItems?: SidebarSubItem[];
  }

  interface SidebarGroup {
    title: string;
    items: SidebarItem[];
  }

  // Sidebar menu configuration matching Hando layout
  const menuGroups: SidebarGroup[] = useMemo(() => [
    {
      title: 'MENU',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          subItems: [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'reports-sales', label: 'Sales Analytics', icon: FileText },
            { id: 'reports-invoices', label: 'Invoice History', icon: Printer },
            { id: 'reports-shifts', label: 'Shift Audits', icon: Clipboard }
          ]
        }
      ]
    },
    {
      title: 'MANAGEMENT',
      items: [
        { id: 'inventory', label: 'Inventory', icon: Package },
        { id: 'expenses', label: 'Expenses', icon: Briefcase }
      ]
    },
    {
      title: 'SETTINGS',
      items: [
        { id: 'settings-employees', label: 'Employees', icon: Users },
        { id: 'settings-staff', label: 'Store Staff', icon: Users },
        { id: 'settings-items', label: 'Item Catalog', icon: Settings },
        { id: 'settings-tax', label: 'Tax Settings', icon: Percent },
        { id: 'settings-printer', label: 'Printer Setup', icon: Printer }
      ]
    }
  ], []);

  // ─────────────────────────────────────────────────────────────────────────
  // BOOTSTRAP INITIAL DATA & LOGIN HANDLER
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      let resolvedApiUrl = 'http://localhost:4000';
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const s = await (window as any).electronAPI.getSettings();
        setSettings(s);
        resolvedApiUrl = s.isMaster ? 'http://localhost:4000' : `http://${s.masterIp}:4000`;
        setApiUrl(resolvedApiUrl);
      } else {
        // Browser fallback for testing
        const mockLogo = localStorage.getItem('test-printerLogoBase64') || '';
        setSettings({ printerLogoBase64: mockLogo } as any);
      }

      // Check query params for active subtab selection
      if (router.query.tab) {
        if (router.query.tab === 'day') {
          setActiveTab('reports-shifts');
        } else if (router.query.tab === 'shift') {
          setActiveTab('reports-shifts');
        }
      }

      // Auto-login if manager pin is passed from POS login screen
      if (router.query.pin) {
        const pin = router.query.pin as string;
        setAdminLoginLoading(true);
        try {
          const res = await fetch(`${resolvedApiUrl}/api/employees/verify-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
          });
          if (res.ok) {
            const emp = await res.json();
            if (emp.role === 'MANAGER') {
              setAdminLoggedIn(emp);
              loadAllData(resolvedApiUrl);
            }
          }
        } catch (err) {
          console.error('Auto login verification failed:', err);
        } finally {
          setAdminLoginLoading(false);
        }
      }
    }
    if (router.isReady) {
      init();
    }
  }, [router.isReady, router.query.pin, router.query.tab]);

  const verifyAdminPin = async (pin: string) => {
    setAdminLoginLoading(true);
    setAdminLoginError('');
    try {
      const res = await fetch(`${apiUrl}/api/employees/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        const emp = await res.json();
        if (emp.role === 'MANAGER') {
          setAdminLoggedIn(emp);
          setAdminLoginPin('');
          loadAllData(apiUrl);
        } else {
          setAdminLoginError('Access Denied. Managers only.');
          setAdminLoginPin('');
        }
      } else {
        setAdminLoginError('Invalid PIN. Please try again.');
        setAdminLoginPin('');
      }
    } catch {
      setAdminLoginError('Connection error.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminPinDigit = (digit: string) => {
    if (adminLoginPin.length >= 4) return;
    const newPin = adminLoginPin + digit;
    setAdminLoginPin(newPin);
    if (newPin.length === 4) {
      verifyAdminPin(newPin);
    }
  };

  const handleAdminPinDelete = () => {
    setAdminLoginPin(prev => prev.slice(0, -1));
  };

  const loadAllData = async (url: string, overrideStart?: string, overrideEnd?: string) => {
    setLoading(true);
    try {
      // 1. Load active day & shift
      const resDay = await fetch(`${url}/api/business-day/active`);
      if (resDay.ok) {
        const day = await resDay.json();
        setActiveBusinessDay(day);
      }

      const resShift = await fetch(`${url}/api/shifts/active`);
      if (resShift.ok) {
        const shift = await resShift.json();
        setActiveShift(shift);
      }

      // 2. Load employees
      const resEmp = await fetch(`${url}/api/admin/employees`);
      if (resEmp.ok) {
        const empList = await resEmp.json();
        setEmployees(empList);
      }

      // 3. Load catalog products
      const resProducts = await fetch(`${url}/api/products`);
      if (resProducts.ok) {
        const prodList = await resProducts.json();
        setProducts(prodList);
      }

      const resCats = await fetch(`${url}/api/settings/categories`);
      if (resCats.ok) {
        const catList = await resCats.json();
        setCategories(catList);
      }

      // 4. Load inventory stock
      const resInv = await fetch(`${url}/api/inventory`);
      if (resInv.ok) {
        const invList = await resInv.json();
        setInventory(invList);
      }

      // 5. Load expenses
      const resExpenses = await fetch(`${url}/api/expenses`);
      if (resExpenses.ok) {
        const expList = await resExpenses.json();
        setExpenses(expList);
      }

      // 6. Load paid invoices
      let paidUrl = `${url}/api/orders/paid`;
      const start = overrideStart !== undefined ? overrideStart : filterStartDate;
      const end = overrideEnd !== undefined ? overrideEnd : filterEndDate;
      const params = new URLSearchParams();
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      if (params.toString()) {
        paidUrl += `?${params.toString()}`;
      }
      const resPaid = await fetch(paidUrl);
      if (resPaid.ok) {
        const invoices = await resPaid.json();
        setPaidOrders(invoices);
      }

      // 7. Load shift logs
      const resShifts = await fetch(`${url}/api/reports/shifts`);
      if (resShifts.ok) {
        const auditList = await resShifts.json();
        setShiftsList(auditList);
      }

      // 8. Load store staff list
      const resStaff = await fetch(`${url}/api/settings/staff`);
      if (resStaff.ok) {
        const staff = await resStaff.json();
        setStaffList(staff);
      }
    } catch (err) {
      console.error('Failed to query local server databases:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper toggle submenu
  const toggleSubmenu = (menuId: string) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD MATH METRICS
  // ─────────────────────────────────────────────────────────────────────────
  const dashboardStats = useMemo(() => {
    // 1. Total revenue
    const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total), 0);
    // 2. Order Count
    const orderCount = paidOrders.length;
    // 3. Stock warning count
    const stockWarnings = inventory.filter(item => item.quantity <= item.minThreshold).length;
    // 4. Expense count
    const expenseTotal = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

    return { revenue, orderCount, stockWarnings, expenseTotal };
  }, [paidOrders, inventory, expenses]);

  // Chart data formatting: Sales by category
  const donutChartData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    let totalSales = 0;

    paidOrders.forEach(order => {
      order.items.forEach(item => {
        const cat = item.productVariant?.product?.category || 'Drinks';
        const lineTotal = Number(item.unitPrice) * item.quantity;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + lineTotal;
        totalSales += lineTotal;
      });
    });

    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    return Object.entries(categoryTotals).map(([label, value], i) => ({
      label,
      value,
      color: colors[i % colors.length]
    })).sort((a, b) => b.value - a.value);
  }, [paidOrders]);

  // Chart data formatting: Sales by day of the week
  const barChartData = useMemo(() => {
    const dayTotals: Record<string, number> = {
      'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0
    };

    paidOrders.forEach(order => {
      const date = new Date(order.createdAt);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      if (dayTotals[dayName] !== undefined) {
        dayTotals[dayName] += Number(order.total);
      }
    });

    return Object.entries(dayTotals).map(([label, value]) => ({ label, value }));
  }, [paidOrders]);

  // Recent 5 transactions
  const recentOrders = useMemo(() => {
    return paidOrders.slice(0, 5);
  }, [paidOrders]);

  // Waiter Performance Statistics
  const waiterStats = useMemo(() => {
    const stats: Record<string, { name: string; sales: number; count: number }> = {};
    paidOrders.forEach(order => {
      if (order.waiterInfo) {
        const waiter = order.waiterInfo.trim();
        if (waiter) {
          if (!stats[waiter]) {
            stats[waiter] = { name: waiter, sales: 0, count: 0 };
          }
          stats[waiter].sales += Number(order.total || 0);
          stats[waiter].count += 1;
        }
      }
    });
    return Object.values(stats).sort((a, b) => b.sales - a.sales);
  }, [paidOrders]);

  // Delivery Channel Statistics
  const deliveryStats = useMemo(() => {
    const stats: Record<string, { platform: string; sales: number; count: number }> = {
      'FOODPANDA': { platform: 'Foodpanda', sales: 0, count: 0 },
      'UBER_EATS': { platform: 'Uber Eats', sales: 0, count: 0 },
      'OTHER': { platform: 'Other', sales: 0, count: 0 },
    };
    paidOrders.forEach(order => {
      if (order.orderType === 'DELIVERY') {
        const platform = order.deliveryPlatform || 'OTHER';
        if (!stats[platform]) {
          stats[platform] = { platform: platform, sales: 0, count: 0 };
        }
        stats[platform].sales += Number(order.total || 0);
        stats[platform].count += 1;
      }
    });
    return Object.values(stats).filter(s => s.sales > 0 || s.count > 0).sort((a, b) => b.sales - a.sales);
  }, [paidOrders]);


  // ─────────────────────────────────────────────────────────────────────────
  // 2-PAGE EXECUTIVE SALES REPORT PDF GENERATOR (PAKISTAN / PK CURRENCY SAFE)
  // ─────────────────────────────────────────────────────────────────────────
  const handleDownloadSalesReportPdf = () => {
    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const orderCount = paidOrders.length;
    const avgOrderValue = orderCount > 0 ? (totalRevenue / orderCount) : 0;
    const totalSubtotal = paidOrders.reduce((s, o) => s + Number(o.subtotal || 0), 0);
    const totalTax = paidOrders.reduce((s, o) => s + Number(o.tax || 0), 0);

    // Payment Breakout
    const cashOrders = paidOrders.filter(o => o.paymentMethod === 'CASH');
    const cashSales = cashOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const cashShare = totalRevenue > 0 ? ((cashSales / totalRevenue) * 100).toFixed(1) : '0.0';

    const cardOrders = paidOrders.filter(o => o.paymentMethod === 'CARD');
    const cardSales = cardOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const cardShare = totalRevenue > 0 ? ((cardSales / totalRevenue) * 100).toFixed(1) : '0.0';

    // Channel Breakout
    const dineInOrders = paidOrders.filter(o => o.orderType === 'DINE_IN');
    const dineInSales = dineInOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const dineInShare = totalRevenue > 0 ? ((dineInSales / totalRevenue) * 100).toFixed(1) : '0.0';

    const takeAwayOrders = paidOrders.filter(o => o.orderType === 'TAKE_AWAY');
    const takeAwaySales = takeAwayOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const takeAwayShare = totalRevenue > 0 ? ((takeAwaySales / totalRevenue) * 100).toFixed(1) : '0.0';

    const deliveryOrders = paidOrders.filter(o => o.orderType === 'DELIVERY');
    const deliverySales = deliveryOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const deliveryShare = totalRevenue > 0 ? ((deliverySales / totalRevenue) * 100).toFixed(1) : '0.0';

    // Sub-channel Delivery breakdown
    const deliveryPlatforms: Record<string, { count: number; sales: number }> = {};
    deliveryOrders.forEach(o => {
      const p = o.deliveryPlatform || 'OTHER';
      if (!deliveryPlatforms[p]) deliveryPlatforms[p] = { count: 0, sales: 0 };
      deliveryPlatforms[p].count += 1;
      deliveryPlatforms[p].sales += Number(o.total || 0);
    });

    // Category Breakdown (Page 2)
    const categoryMetrics: Record<string, { qty: number; sales: number }> = {};
    let totalCatSales = 0;

    paidOrders.forEach(order => {
      order.items?.forEach((item: any) => {
        const cat = item.productVariant?.product?.category || 'General';
        const lineTotal = Number(item.unitPrice || 0) * (item.quantity || 1);
        if (!categoryMetrics[cat]) categoryMetrics[cat] = { qty: 0, sales: 0 };
        categoryMetrics[cat].qty += item.quantity || 1;
        categoryMetrics[cat].sales += lineTotal;
        totalCatSales += lineTotal;
      });
    });

    const categoryList = Object.entries(categoryMetrics).map(([cat, m]) => ({
      category: cat,
      qty: m.qty,
      sales: m.sales,
      percent: totalCatSales > 0 ? ((m.sales / totalCatSales) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.sales - a.sales);

    // Elegant, cohesive color palette for category chart & legend (Professional, non-rainbow)
    const chartColors = ['#4f46e5', '#2563eb', '#0284c7', '#0d9488', '#16a34a', '#ca8a04', '#dc2626', '#475569'];

    // Generate conic gradient stops for reliable circle chart rendering in print CSS
    let currentPct = 0;
    const conicStops = categoryList.map((item, idx) => {
      const p = parseFloat(item.percent);
      const color = chartColors[idx % chartColors.length];
      const start = currentPct;
      currentPct += p;
      return `${color} ${start.toFixed(1)}% ${currentPct.toFixed(1)}%`;
    }).join(', ');

    const conicStyle = categoryList.length > 0 
      ? `background: conic-gradient(${conicStops});` 
      : `background: #cbd5e1;`;

    const businessName = settings.businessName || 'CHIMNEY CORNER POS';
    const timestamp = new Date().toLocaleString();

    const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Breakdown Executive Report</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page {
            width: 100%;
            min-height: 265mm;
            box-sizing: border-box;
            position: relative;
            padding-bottom: 25px;
          }
          .page-break {
            page-break-before: always;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .brand-title {
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            letter-spacing: -0.5px;
          }
          .report-subtitle {
            font-size: 11px;
            color: #475569;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .meta-box {
            text-align: right;
            font-size: 10px;
            color: #0f172a;
          }
          .section-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            color: #0f172a;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 6px;
            margin-top: 18px;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
          }
          .grid-4 {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 16px;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
            margin-bottom: 16px;
          }
          .card {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 12px;
          }
          .card-label {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            color: #475569;
            letter-spacing: 0.5px;
          }
          .card-val {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 4px;
          }
          .card-sub {
            font-size: 9px;
            color: #475569;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-top: 8px;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 9px;
            padding: 8px 10px;
            text-align: left;
          }
          td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            color: #0f172a;
          }
          tr:nth-child(even) td {
            background: #f8fafc;
          }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 700;
            background: #e2e8f0;
            color: #0f172a;
          }
          .footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #64748b;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
          }
          .chart-container {
            display: flex;
            align-items: center;
            gap: 28px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 18px;
            margin-bottom: 16px;
          }
          .donut-ring {
            width: 160px;
            height: 160px;
            border-radius: 50%;
            ${conicStyle}
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          }
          .donut-hole {
            width: 90px;
            height: 90px;
            border-radius: 50%;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            border: 1px solid #f1f5f9;
          }
          .legend-list {
            flex: 1;
          }
          .legend-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 10px;
            padding: 5px 0;
            border-bottom: 1px dashed #cbd5e1;
            color: #0f172a;
          }
          .color-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
            margin-right: 6px;
            vertical-align: middle;
          }
        </style>
      </head>
      <body>

        <!-- ════════════════ PAGE 1: SALES & CHANNEL BREAKOUT ════════════════ -->
        <div class="page">
          <div class="header">
            <div>
              <div class="brand-title">${businessName}</div>
              <div class="report-subtitle">Executive Sales Breakdown Report (Page 1 of 2)</div>
            </div>
            <div class="meta-box">
              <div><strong>Branch:</strong> ${settings.branchId || 'MAIN'} | <strong>Terminal:</strong> ${settings.terminalId || 'T1'}</div>
              <div><strong>Generated:</strong> ${timestamp}</div>
            </div>
          </div>

          <div class="section-title">1. Financial Overview</div>
          <div class="grid-4">
            <div class="card">
              <div class="card-label">Total Revenue</div>
              <div class="card-val">${totalRevenue.toFixed(2)}</div>
              <div class="card-sub">Gross sales total</div>
            </div>
            <div class="card">
              <div class="card-label">Total Invoices</div>
              <div class="card-val">${orderCount}</div>
              <div class="card-sub">Transactions count</div>
            </div>
            <div class="card">
              <div class="card-label">Average Order Value</div>
              <div class="card-val">${avgOrderValue.toFixed(2)}</div>
              <div class="card-sub">Revenue per order</div>
            </div>
            <div class="card">
              <div class="card-label">Tax & Subtotal</div>
              <div class="card-val" style="font-size:14px; margin-top:8px;">Sub: ${totalSubtotal.toFixed(2)}</div>
              <div class="card-sub">Tax: ${totalTax.toFixed(2)}</div>
            </div>
          </div>

          <div class="section-title">2. Payment Method Breakdown</div>
          <div class="grid-2">
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="card-label">Cash Payment Sales</div>
                <span class="badge">${cashShare}% Share</span>
              </div>
              <div class="card-val">${cashSales.toFixed(2)}</div>
              <div class="card-sub">${cashOrders.length} Cash Invoices</div>
            </div>
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="card-label">Card Payment Sales</div>
                <span class="badge">${cardShare}% Share</span>
              </div>
              <div class="card-val">${cardSales.toFixed(2)}</div>
              <div class="card-sub">${cardOrders.length} Card Invoices</div>
            </div>
          </div>

          <div class="section-title">3. Sales Channel & Sub-Channel Breakdown</div>
          <div class="grid-4">
            <div class="card">
              <div class="card-label">Dine-In Sales</div>
              <div class="card-val">${dineInSales.toFixed(2)}</div>
              <div class="card-sub">${dineInOrders.length} Orders (${dineInShare}%)</div>
            </div>
            <div class="card">
              <div class="card-label">Takeaway Sales</div>
              <div class="card-val">${takeAwaySales.toFixed(2)}</div>
              <div class="card-sub">${takeAwayOrders.length} Orders (${takeAwayShare}%)</div>
            </div>
            <div class="card">
              <div class="card-label">Delivery Sales</div>
              <div class="card-val">${deliverySales.toFixed(2)}</div>
              <div class="card-sub">${deliveryOrders.length} Orders (${deliveryShare}%)</div>
            </div>
            <div class="card">
              <div class="card-label">Delivery Sub-Channels</div>
              <div class="card-val" style="font-size:14px; margin-top:8px;">${Object.keys(deliveryPlatforms).length} Platforms</div>
              <div class="card-sub">Foodpanda, UberEats, etc.</div>
            </div>
          </div>

          ${Object.keys(deliveryPlatforms).length > 0 ? `
            <table style="margin-top:10px;">
              <thead>
                <tr>
                  <th>Delivery Platform</th>
                  <th style="text-align:center;">Orders Count</th>
                  <th style="text-align:right;">Sub-Channel Revenue</th>
                  <th style="text-align:right;">Share of Delivery</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(deliveryPlatforms).map(([pName, pData]) => `
                  <tr>
                    <td><strong>${pName}</strong></td>
                    <td style="text-align:center;">${pData.count}</td>
                    <td style="text-align:right; font-weight:700;">${pData.sales.toFixed(2)}</td>
                    <td style="text-align:right;">${deliverySales > 0 ? ((pData.sales / deliverySales) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <div class="footer">
            <div>${businessName} POS • Official Executive Sales Report</div>
            <div>Page 1 of 2</div>
          </div>
        </div>

        <!-- ════════════════ PAGE 2: CATEGORY PERFORMANCE & CIRCLE GRAPH ════════════════ -->
        <div class="page page-break">
          <div class="header">
            <div>
              <div class="brand-title">${businessName}</div>
              <div class="report-subtitle">Category Performance & Graphical Breakdown (Page 2 of 2)</div>
            </div>
            <div class="meta-box">
              <div><strong>Report Date:</strong> ${timestamp}</div>
            </div>
          </div>

          <div class="section-title">1. Category Performance Share (Circle Graph)</div>
          <div class="chart-container">
            <div class="donut-ring">
              <div class="donut-hole">
                <div style="font-size:9px; font-weight:700; color:#475569; text-transform:uppercase;">CATEGORY</div>
                <div style="font-size:11px; font-weight:700; color:#0f172a;">SHARE %</div>
              </div>
            </div>
            <div class="legend-list">
              <div style="font-size:11px; font-weight:700; color:#0f172a; margin-bottom:8px; text-transform:uppercase;">Category Performance Legend</div>
              ${categoryList.map((c, i) => `
                <div class="legend-item">
                  <span>
                    <span class="color-dot" style="background:${chartColors[i % chartColors.length]};"></span>
                    <strong>${c.category}</strong>
                  </span>
                  <span><strong>${c.sales.toFixed(2)}</strong> (${c.percent}%)</span>
                </div>
              `).join('')}
              ${categoryList.length === 0 ? `<div style="font-size:10px; color:#64748b;">No categories loaded.</div>` : ''}
            </div>
          </div>

          <div class="section-title">2. Category Performance Audit Table</div>
          <table>
            <thead>
              <tr>
                <th>Category Name</th>
                <th style="text-align:center;">Items Sold (Qty)</th>
                <th style="text-align:right;">Gross Category Revenue</th>
                <th style="text-align:right;">Performance Share (%)</th>
              </tr>
            </thead>
            <tbody>
              ${categoryList.map((c, i) => `
                <tr>
                  <td>
                    <span class="color-dot" style="background:${chartColors[i % chartColors.length]};"></span>
                    <strong>${c.category}</strong>
                  </td>
                  <td style="text-align:center; font-weight:700;">${c.qty}</td>
                  <td style="text-align:right; font-weight:700;">${c.sales.toFixed(2)}</td>
                  <td style="text-align:right;">
                    <span class="badge">${c.percent}%</span>
                  </td>
                </tr>
              `).join('')}
              ${categoryList.length === 0 ? `
                <tr>
                  <td colSpan="4" style="text-align:center; padding:20px; color:#64748b;">No category sales data recorded.</td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <div class="footer">
            <div>${businessName} POS • End of Executive Sales Report</div>
            <div>Page 2 of 2</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(reportHtml);
      printWin.document.close();
    } else {
      showToast('Popup blocked. Please allow popups to download the PDF report.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHIFT MANAGEMENT BUSINESS LOGIC
  // ─────────────────────────────────────────────────────────────────────────
  const handleStartBusinessDay = async () => {
    try {
      const r = await fetch(`${apiUrl}/api/business-day/open`, { method: 'POST' });
      if (!r.ok) {
        const err = await r.json();
        showToast(err.error || 'Failed to open business day');
        return;
      }
      loadAllData(apiUrl);
    } catch (error) {
      showToast('LAN server network error');
    }
  };

  const handleCloseBusinessDay = async () => {
    if (!activeBusinessDay) return;
    try {
      const r = await fetch(`${apiUrl}/api/business-day/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDayId: activeBusinessDay.id })
      });
      if (!r.ok) {
        const err = await r.json();
        showToast(err.error || 'Failed to close business day');
        return;
      }
      showToast('Business day successfully closed!');
      loadAllData(apiUrl);
    } catch (error) {
      showToast('Network failure ending business day');
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPin || !activeBusinessDay) return;
    setLoginError('');

    try {
      // 1. Verify PIN
      const resVerify = await fetch(`${apiUrl}/api/employees/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: loginPin })
      });
      if (!resVerify.ok) {
        setLoginError('Invalid Employee PIN code.');
        return;
      }
      const employee = await resVerify.json();

      // 2. Open Shift
      const resShift = await fetch(`${apiUrl}/api/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeePin: loginPin,
          openingBalance: parseFloat(adminOpeningBalance) || 0.0,
          businessDayId: activeBusinessDay.id
        })
      });

      if (!resShift.ok) {
        const err = await resShift.json();
        setLoginError(err.error || 'Failed to open shift register drawer.');
        return;
      }

      setLoginPin('');
      setAdminOpeningBalance('');
      showToast(`Shift successfully opened for cashier: ${employee.name}`);
      loadAllData(apiUrl);
    } catch (err) {
      setLoginError('LAN network error connecting register.');
    }
  };

  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift || !closingCash) return;

    try {
      const res = await fetch(`${apiUrl}/api/shifts/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: activeShift.id,
          actualCash: parseFloat(closingCash) || 0.0
        })
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to close register.');
        return;
      }

      setIsClosingShift(false);
      setClosingCash('');
      showToast('Register drawer shift auditing complete. Shift Closed.');
      loadAllData(apiUrl);
    } catch (err) {
      showToast('LAN connectivity exception.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS: CRUD FOR EMPLOYEES
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmployeeError('');
    if (!newEmployee.pin || !newEmployee.name) {
      setEmployeeError('All fields are required.');
      return;
    }
    if (newEmployee.pin.length !== 4) {
      setEmployeeError('PIN must be exactly 4 digits.');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/settings/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee)
      });
      if (res.ok) {
        setNewEmployee({ pin: '', name: '', role: 'CASHIER' });
        setIsEmployeeModalOpen(false);
        loadAllData(apiUrl);
      } else {
        const err = await res.json();
        setEmployeeError(err.error || 'Failed to save employee.');
      }
    } catch (err) {
      setEmployeeError('LAN server link failed.');
    }
  };

  const handleDeleteEmployee = async (pin: string) => {
    if (pin === '0000') {
      showToast('Cannot delete default system Manager account.');
      return;
    }
    if (!confirm('Are you sure you want to delete this employee log?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/settings/employees/${pin}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadAllData(apiUrl);
      } else {
        showToast('Could not execute delete command on LAN API.');
      }
    } catch (err) {
      showToast('LAN server offline.');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');

    const roleToUse = showCustomRoleInput ? customRoleInput : newStaff.role;
    if (!roleToUse) {
      setStaffError('Please select or specify a role.');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/settings/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newStaff, role: roleToUse })
      });
      if (res.ok) {
        const result = await res.json();
        setStaffList(result.staff);
        setNewStaff({
          code: '',
          name: '',
          fatherName: '',
          role: 'Waiter',
          cnic: '',
          salary: '',
          status: 'ACTIVE'
        });
        setCustomRoleInput('');
        setShowCustomRoleInput(false);
        showToast('Staff member saved successfully.');
      } else {
        const err = await res.json();
        setStaffError(err.error || 'Failed to save staff member.');
      }
    } catch {
      setStaffError('API connection error.');
    }
  };

  const handleDeleteStaff = async (code: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/settings/staff/${code}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const result = await res.json();
        setStaffList(result.staff);
        showToast('Staff member deleted.');
      } else {
        showToast('Failed to delete staff member.');
      }
    } catch {
      showToast('API connection error.');
    }
  };

  const toggleStaffStatus = async (s: any) => {
    try {
      const nextStatus = s.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      const res = await fetch(`${apiUrl}/api/settings/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...s, status: nextStatus })
      });
      if (res.ok) {
        const result = await res.json();
        setStaffList(result.staff);
        showToast(`Staff member marked as ${nextStatus.toLowerCase()}.`);
      } else {
        showToast('Failed to toggle staff status.');
      }
    } catch {
      showToast('API connection error.');
    }
  };

  const handleUpdateTaxSettings = async (enabled: boolean, rate: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxEnabled: enabled,
          taxRate: rate
        })
      });
      if (res.ok) {
        setSettings((prev: any) => ({ ...prev, taxEnabled: enabled, taxRate: rate }));
      } else {
        showToast('Failed to update tax settings on local LAN server.');
      }
    } catch (err) {
      showToast('LAN server communication error.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS: CRUD FOR ITEMS
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductError('');
    if (!newProduct.name.trim() || !newProduct.price || !newProduct.sku.trim() || !newProduct.category.trim()) {
      setProductError('All fields (Name, Category, Price, SKU) are required.');
      return;
    }

    try {
      const method = editingProduct ? 'PUT' : 'POST';
      const url = editingProduct
        ? `${apiUrl}/api/products/${editingProduct.id}`
        : `${apiUrl}/api/products`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProduct.name.trim(),
          category: newProduct.category.trim(),
          description: '',
          price: parseFloat(newProduct.price) || 0.0,
          sku: newProduct.sku.trim(),
          status: newProduct.status,
          bgColor: newProduct.bgColor,
          textColor: newProduct.textColor
        })
      });
      if (res.ok) {
        setNewProduct({ name: '', price: '', category: categories[0]?.name || '', sku: '', status: 'ACTIVE', bgColor: '', textColor: '' });
        setEditingProduct(null);
        setIsProductModalOpen(false);
        loadAllData(apiUrl);
      } else {
        let errorMsg = 'Failed to save product.';
        try {
          const err = await res.json();
          errorMsg = err.error || errorMsg;
        } catch {
          errorMsg = `Error ${res.status}: ${res.statusText || 'Unknown server error'}`;
        }
        setProductError(errorMsg);
      }
    } catch (err: any) {
      console.error('Error saving product:', err);
      setProductError(err.message || 'LAN API database connection timed out.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError('');
    if (!newCategory.name.trim()) {
      setCategoryError('Category name is required.');
      return;
    }

    try {
      const method = editingCategory ? 'PUT' : 'POST';
      const url = editingCategory
        ? `${apiUrl}/api/settings/categories/${encodeURIComponent(editingCategory.name)}`
        : `${apiUrl}/api/settings/categories`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategory.name.trim(),
          status: newCategory.status,
          bgColor: newCategory.bgColor,
          textColor: newCategory.textColor
        })
      });
      if (res.ok) {
        setNewCategory({ name: '', status: 'ACTIVE', bgColor: '', textColor: '' });
        setEditingCategory(null);
        setIsCategoryModalOpen(false);
        loadAllData(apiUrl);
      } else {
        let errorMsg = 'Failed to save category.';
        try {
          const err = await res.json();
          errorMsg = err.error || errorMsg;
        } catch {
          errorMsg = `Error ${res.status}: ${res.statusText || 'Unknown server error'}`;
        }
        setCategoryError(errorMsg);
      }
    } catch (err: any) {
      console.error('Error saving category:', err);
      setCategoryError(err.message || 'LAN API database connection timed out.');
    }
  };

  const handleDeleteCategory = async (name: string) => {
    if (!confirm(`Delete category "${name}" completely?`)) return;

    try {
      const res = await fetch(`${apiUrl}/api/settings/categories/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadAllData(apiUrl);
      } else {
        showToast('Failed to delete category.');
      }
    } catch (err) {
      showToast('LAN server communication error.');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Delete this catalog item completely?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/products/${productId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadAllData(apiUrl);
      } else {
        showToast('Failed to delete item.');
      }
    } catch (err) {
      showToast('LAN server socket failed.');
    }
  };

  const toggleProductStatus = async (prod: Product) => {
    const newStatus = prod.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    try {
      const res = await fetch(`${apiUrl}/api/products/${prod.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prod.name,
          category: prod.category,
          price: prod.variants[0]?.price || 0.0,
          sku: prod.variants[0]?.sku || '',
          status: newStatus
        })
      });
      if (res.ok) {
        loadAllData(apiUrl);
      } else {
        showToast('Failed to toggle product status.');
      }
    } catch (err) {
      showToast('Communication error.');
    }
  };

  const toggleCategoryStatus = async (cat: CategorySetting) => {
    const newStatus = cat.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    try {
      const res = await fetch(`${apiUrl}/api/settings/categories/${encodeURIComponent(cat.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cat.name,
          status: newStatus
        })
      });
      if (res.ok) {
        loadAllData(apiUrl);
      } else {
        showToast('Failed to toggle category status.');
      }
    } catch (err) {
      showToast('Communication error.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS: CRUD FOR EXPENSES
  // ─────────────────────────────────────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError('');
    if (!newExpense.category || !newExpense.amount) {
      setExpenseError('Category and Amount are required fields.');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense)
      });
      if (res.ok) {
        setNewExpense({ category: 'Rent', amount: '', description: '', date: '' });
        setIsExpenseModalOpen(false);
        loadAllData(apiUrl);
      } else {
        const err = await res.json();
        setExpenseError(err.error || 'Failed to save expense entry.');
      }
    } catch (err) {
      setExpenseError('API server communication error.');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Permanently delete this expense receipt voucher?')) return;

    try {
      const res = await fetch(`${apiUrl}/api/expenses/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadAllData(apiUrl);
      } else {
        showToast('Delete command rejected by local daemon.');
      }
    } catch (err) {
      showToast('LAN link offline.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PRINT RECEIPT ROUTINE
  // ─────────────────────────────────────────────────────────────────────────
  const triggerPrintReceipt = async (order: Order) => {
    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      showToast('Raw print hardware access only works inside the Electron client container.');
      return;
    }

    try {
      const receiptItems = order.items.map((item: any) => ({
        name: `${item.productVariant?.product?.name} (${item.productVariant?.name})`,
        qty: item.quantity,
        price: Number(item.unitPrice),
        modifiers: item.modifiers?.map((m: any) => m.modifier?.name) || []
      }));

      await (window as any).electronAPI.printReceipt('127.0.0.1', {
        orderNumber: order.orderNumber,
        dateTime: order.createdAt,
        employeeName: activeShift?.employeeName || 'Admin Manager',
        items: receiptItems,
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        total: Number(order.total),
        paymentMethod: order.paymentMethod,
        orderType: order.orderType,
        tableNumber: order.tableNumber
      });

      showToast('Receipt sent to POS printer bridge.');
    } catch (err) {
      showToast('Printer offline.');
    }
  };

  // Navigation items config
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart2,
      subItems: [
        { id: 'reports-sales', label: 'Sales Analytics', icon: FileText },
        { id: 'reports-invoices', label: 'Invoice History', icon: Printer },
        { id: 'reports-shifts', label: 'Shift Audits', icon: Clipboard }
      ]
    },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'expenses', label: 'Expenses', icon: Briefcase },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      subItems: [
        { id: 'settings-employees', label: 'Employees', icon: Users },
        { id: 'settings-items', label: 'Item Catalog', icon: Settings }
      ]
    }
  ];

  if (!adminLoggedIn) {
    return (
      <div className={`min-h-screen flex flex-col justify-center items-center px-4 relative overflow-hidden ${bgClass} transition-colors duration-300 font-sans`}>
        <Head>
          <title>Admin Login ·TwinTech POS </title>
        </Head>

        {/* Background glow animations */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-purple-500/10 rounded-full filter blur-[80px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/3 w-72 h-72 bg-indigo-500/8 rounded-full filter blur-[60px] pointer-events-none" />

        <div className="w-full max-w-sm relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-xl shadow-purple-900/40">
              <Settings className="w-8 h-8 animate-spin-slow" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-4">Café Admin</h1>
            <p className="text-xs text-purple-400 font-semibold tracking-wide uppercase">Manager Login Required</p>
          </div>

          <div className={`border p-6 rounded-2xl shadow-2xl space-y-5 ${cardClass}`}>
            <div className="text-center space-y-1">
              <h2 className="text-sm font-bold">Enter your Admin PIN</h2>
              <p className="text-[10px] text-purple-400">Identify yourself to access multi-branch controls</p>
            </div>

            {/* PIN Dots display */}
            <div className="flex justify-center gap-3.5 py-1">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${i < adminLoginPin.length
                    ? 'bg-purple-500 border-purple-500 scale-110 shadow-lg shadow-purple-500/50'
                    : 'bg-transparent border-purple-800'
                    }`}
                />
              ))}
            </div>

            {adminLoginError && (
              <div className="text-center text-[10px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 py-1.5 px-3 rounded-lg">
                {adminLoginError}
              </div>
            )}

            {/* Keypad Grid */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => d === '⌫' ? handleAdminPinDelete() : d !== '' ? handleAdminPinDigit(d) : undefined}
                  disabled={adminLoginLoading || d === ''}
                  className={`h-12 rounded-xl font-bold text-sm transition active:scale-95 flex items-center justify-center ${d === '⌫'
                    ? 'bg-purple-950/40 border border-purple-900/60 text-purple-400 hover:bg-purple-900/20'
                    : d === ''
                      ? 'invisible'
                      : isDark
                        ? 'bg-purple-950/20 border border-purple-900/40 text-purple-200 hover:bg-purple-950/50 hover:text-white'
                        : 'bg-purple-50 border border-purple-100 text-purple-950 hover:bg-purple-100'
                    } disabled:cursor-not-allowed`}
                >
                  {d === '⌫' ? '⌫' : d}
                </button>
              ))}
            </div>

            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 border border-purple-500/30 hover:bg-purple-500/10 text-purple-400 font-semibold text-xs rounded-lg transition"
            >
              Cancel & Return to POS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex ${bgClass} transition-colors duration-300 font-sans`}>
      <Head>
        <title>Admin Dashboard · CHIMNEY CORNER</title>
      </Head>

      {/* ───────────────────────────────────────────────────────────────────
          CRM SIDEBAR LAYOUT
          ─────────────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed left-0 top-0 h-screen z-30 transition-all duration-300 ease-in-out ${isSidebarExpanded ? 'w-64 shadow-2xl' : 'w-16'
          } ${sidebarClass} flex flex-col justify-between shrink-0 overflow-hidden`}
      >
        <div className="flex-1 flex flex-col pt-4 overflow-y-auto scrollbar-none">
          {/* Logo Brand Header */}
          <div className={`flex ${isSidebarExpanded ? 'items-center justify-between px-4' : 'flex-col items-center gap-4 py-2'} mb-8 shrink-0`}>
            <div className="flex items-center gap-3">
              {/* Hando-style Logo Icon */}
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <div className="w-3.5 h-3.5 border-[2.5px] border-white rounded-[3px]" />
              </div>
              {isSidebarExpanded && (
                <span className="font-bold text-base tracking-tight text-white transition-opacity duration-300">
                  Chimney Corner
                </span>
              )}
            </div>
            {/* Collapse Toggle Arrow Button */}
            <button
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
              className={`p-1.5 rounded hover:bg-purple-900/20 text-purple-400 hover:text-purple-200 transition ${!isSidebarExpanded ? 'mt-1' : ''}`}
              title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {isSidebarExpanded ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 space-y-4 px-2 select-none">
            {menuGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                {isSidebarExpanded && (
                  <div className={`px-4 py-1.5 text-[9px] font-extrabold tracking-widest uppercase ${groupTitleCls}`}>
                    {group.title}
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const hasSub = !!item.subItems;
                    const isMenuExpanded = expandedMenus[item.id];
                    const isSelected = activeTab === item.id || item.subItems?.some(s => s.id === activeTab);

                    return (
                      <div key={item.id} className="space-y-1">
                        {/* Parent level link */}
                        <button
                          onClick={() => {
                            if (!isSidebarExpanded) {
                              setIsSidebarExpanded(true);
                              if (hasSub && !isMenuExpanded) {
                                toggleSubmenu(item.id);
                              }
                            } else {
                              if (hasSub) {
                                toggleSubmenu(item.id);
                              } else {
                                setActiveTab(item.id);
                              }
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition duration-150 relative ${isSelected
                            ? parentActiveCls
                            : parentHoverCls
                            }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          {isSidebarExpanded && (
                            <span className="flex-1 text-left truncate">{item.label}</span>
                          )}
                          {isSidebarExpanded && hasSub && (
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition duration-150 ${isMenuExpanded ? 'transform rotate-180' : ''}`}
                            />
                          )}
                        </button>

                        {/* Submenu rendering */}
                        {isSidebarExpanded && hasSub && isMenuExpanded && (
                          <div className="pl-4 space-y-1">
                            {item.subItems?.map((sub) => {
                              const SubIcon = sub.icon;
                              const isSubSelected = activeTab === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => setActiveTab(sub.id)}
                                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-[11px] font-medium transition duration-150 ${isSubSelected
                                    ? subActiveCls
                                    : subHoverCls
                                    }`}
                                >
                                  <SubIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                  <span>{sub.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer (Theme toggle & Back button) */}
        <div className="p-3 border-t border-purple-950/40 space-y-2 shrink-0">
          <button
            onClick={() => {
              const nextTheme = theme === 'dark' ? 'light' : 'dark';
              setTheme(nextTheme);
              localStorage.setItem('pos-theme', nextTheme);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-purple-900/10 text-purple-400 hover:text-purple-200 transition"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isSidebarExpanded && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          <button
            onClick={() => {
              setAdminLoggedIn(null);
              router.push('/');
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition shadow-lg shadow-purple-900/30"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────────────
          MAIN WORKSPACE CONTENT PANEL
          ─────────────────────────────────────────────────────────────────── */}
      <main
        className={`flex-1 h-screen transition-all duration-300 ${isSidebarExpanded ? 'pl-64' : 'pl-16'
          } flex flex-col`}
      >

        {/* Global Toast Notification */}
        {toast && (
          <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg border text-sm font-semibold animate-in fade-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
            toast.type === 'info' ? 'bg-blue-50 text-blue-600 border-blue-200' :
              'bg-rose-50 text-rose-600 border-rose-200'
            }`}>
            {toast.msg}
          </div>
        )}

        {/* Header toolbar */}
        <header
          className={`h-14 px-6 border-b ${borderClass} flex justify-between items-center ${isDark ? 'bg-[#0d0b16]/75' : 'bg-white/85'
            } backdrop-blur-md sticky top-0 z-20`}
        >
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold capitalize">
              {activeTab.replace('-', ' · ')}
            </h1>
            {loading && <RefreshCw className="w-3.5 h-3.5 text-purple-500 animate-spin ml-2" />}
          </div>

          <div className="flex items-center gap-3">
            {/* Business Day indicator */}
            <div
              className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border ${activeBusinessDay
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {activeBusinessDay
                  ? `Day Open · ${new Date(activeBusinessDay.openedAt).toLocaleDateString()}`
                  : 'Business Day Closed'}
              </span>
            </div>

            {/* Shift Indicator */}
            <div
              className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border ${activeShift
                ? 'bg-purple-500/10 border-purple-500/25 text-purple-400'
                : 'bg-slate-500/10 border-slate-500/25 text-slate-400'
                }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{activeShift ? `Till active · ${activeShift.employeeName}` : 'No active shift'}</span>
            </div>
          </div>
        </header>

        {/* Inner Content Area */}
        <div className="flex-1 p-6 space-y-6 w-full overflow-y-auto">
          {/* Custom Date Range Filter for Sales Reports */}
          {['overview', 'reports-sales', 'reports-invoices'].includes(activeTab) && (
            <div className={`p-4 rounded-xl border ${cardClass} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300`}>
              <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-60">Start Date</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border focus:outline-none focus:ring-1 focus:ring-purple-500 w-[140px] ${inputClass}`}
                  />
                </div>
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[9px] font-bold uppercase tracking-wider opacity-60">End Date</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border focus:outline-none focus:ring-1 focus:ring-purple-500 w-[140px] ${inputClass}`}
                  />
                </div>
                <div className="flex items-end gap-2 h-full pt-4 sm:pt-4">
                  <button
                    onClick={() => loadAllData(apiUrl)}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-purple-900/20"
                  >
                    Apply Filter
                  </button>
                  {(filterStartDate || filterEndDate) && (
                    <button
                      onClick={() => {
                        setFilterStartDate('');
                        setFilterEndDate('');
                        loadAllData(apiUrl, '', '');
                      }}
                      className="px-3 py-1.5 border border-purple-500/30 hover:bg-purple-500/10 text-purple-400 rounded-lg text-xs font-semibold transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[10px] opacity-60 font-semibold text-left sm:text-right w-full sm:w-auto self-center">
                {filterStartDate || filterEndDate ? (
                  <span className="text-purple-400">Custom Filter Active</span>
                ) : (
                  <span>Showing Active Shift / Today's Sales</span>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: OVERVIEW
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Header with Download Sales Report (PDF) button */}
              <div className={`p-4 rounded-xl border ${cardClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3`}>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider">Executive Sales Overview</h2>
                  <p className="text-[10px] opacity-60 font-semibold mt-0.5">Real-time revenue, payment channels, and category performance analytics</p>
                </div>
                <button
                  onClick={handleDownloadSalesReportPdf}
                  className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition shadow-md flex items-center gap-2 shrink-0 active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download Sales Report (PDF)
                </button>
              </div>

              {/* Grid: 4 KPI Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    title: 'Total Revenue',
                    value: `${dashboardStats.revenue.toFixed(2)}`,
                    desc: 'Accumulated business sales',
                    icon: DollarSign,
                    color: 'text-purple-500 bg-purple-500/10'
                  },
                  {
                    title: 'Invoices Paid',
                    value: dashboardStats.orderCount,
                    desc: 'Transactions processed today',
                    icon: FileText,
                    color: 'text-blue-500 bg-blue-500/10'
                  },
                  {
                    title: 'Low Stock Warnings',
                    value: dashboardStats.stockWarnings,
                    desc: 'Ingredients below thresholds',
                    icon: AlertTriangle,
                    color: dashboardStats.stockWarnings > 0 ? 'text-amber-500 bg-amber-500/10 animate-pulse' : 'text-slate-400 bg-slate-500/10'
                  },
                  {
                    title: 'Voucher Expenses',
                    value: `${dashboardStats.expenseTotal.toFixed(2)}`,
                    desc: 'Operational payouts',
                    icon: Briefcase,
                    color: 'text-rose-500 bg-rose-500/10'
                  }
                ].map((kpi, i) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={i} className={`p-5 rounded-xl border ${cardClass} flex items-center justify-between`}>
                      <div className="space-y-1">
                        <span className={`text-[10px] uppercase font-bold tracking-widest ${textMuted}`}>
                          {kpi.title}
                        </span>
                        <h2 className="text-xl font-bold tracking-tight">{kpi.value}</h2>
                        <span className="text-[10px] font-medium opacity-60 block">{kpi.desc}</span>
                      </div>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${kpi.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid: Analytical Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 7-Day Revenue Graph */}
                <div className={`p-5 rounded-xl border ${cardClass} lg:col-span-2 space-y-4`}>
                  <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider">Weekly Revenue Analytics</h3>
                      <p className="text-[10px] opacity-60 font-semibold mt-0.5">Interact by hovering on bars</p>
                    </div>
                    <span className="text-xs font-bold text-purple-400">{dashboardStats.revenue.toFixed(2)} Total</span>
                  </div>
                  <div className="pt-2 flex justify-center">
                    <InteractiveBarChart data={barChartData} isDark={isDark} />
                  </div>
                </div>

                {/* Category breakdown pie */}
                <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                  <div className="border-b border-purple-950/20 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider">Category Revenue</h3>
                    <p className="text-[10px] opacity-60 font-semibold mt-0.5">Share of sales categories</p>
                  </div>
                  <div className="pt-2">
                    <DonutChart data={donutChartData} isDark={isDark} />
                  </div>
                </div>
              </div>

              {/* Grid: Waiter & Delivery Performance */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Waiter Performance */}
                <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                  <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider">Waiter Performance</h3>
                      <p className="text-[10px] opacity-60 font-semibold mt-0.5">Top performing waiters by sales revenue</p>
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-[250px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-purple-950/25 opacity-70">
                          <th className="py-2.5 font-bold">Waiter Name</th>
                          <th className="py-2.5 font-bold text-center">Orders</th>
                          <th className="py-2.5 font-bold text-right">Total Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-950/10">
                        {waiterStats.map((w, idx) => (
                          <tr key={w.name} className={`${hoverClass} transition`}>
                            <td className="py-3 font-semibold flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                idx === 0 ? 'bg-amber-500/20 text-amber-500 border border-amber-500/20' :
                                idx === 1 ? 'bg-slate-300/20 text-slate-400 border border-slate-300/20' :
                                'bg-purple-500/10 text-purple-400 border border-purple-500/10'
                              }`}>
                                {idx + 1}
                              </span>
                              {w.name}
                            </td>
                            <td className="py-3 text-center opacity-85 font-medium">{w.count}</td>
                            <td className="py-3 font-bold text-right text-purple-400">{w.sales.toFixed(2)}</td>
                          </tr>
                        ))}
                        {waiterStats.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-8 text-center opacity-60 italic">
                              No waiter sales recorded for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Delivery Channels */}
                <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                  <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider">Delivery Channel Performance</h3>
                      <p className="text-[10px] opacity-60 font-semibold mt-0.5">Sales generated across delivery platforms</p>
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-[250px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-purple-950/25 opacity-70">
                          <th className="py-2.5 font-bold">Platform</th>
                          <th className="py-2.5 font-bold text-center">Orders</th>
                          <th className="py-2.5 font-bold text-right">Total Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-950/10">
                        {deliveryStats.map((d) => (
                          <tr key={d.platform} className={`${hoverClass} transition`}>
                            <td className="py-3 font-semibold">{d.platform}</td>
                            <td className="py-3 text-center opacity-85 font-medium">{d.count}</td>
                            <td className="py-3 font-bold text-right text-purple-400">{d.sales.toFixed(2)}</td>
                          </tr>
                        ))}
                        {deliveryStats.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-8 text-center opacity-60 italic">
                              No delivery platform sales recorded for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Table: Recent paid invoices feed */}
              <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider">Recent Transactions</h3>
                    <p className="text-[10px] opacity-60 font-semibold mt-0.5">Latest receipts created</p>
                  </div>
                  <button onClick={() => setActiveTab('reports-invoices')} className="text-xs font-bold text-purple-400 hover:underline">
                    View Invoices
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Order ID</th>
                        <th className="py-2.5 font-bold">Time</th>
                        <th className="py-2.5 font-bold">Channel</th>
                        <th className="py-2.5 font-bold">Payment</th>
                        <th className="py-2.5 font-bold text-right">Gross Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {recentOrders.map((ord) => (
                        <tr key={ord.id} className={`${hoverClass} transition`}>
                          <td className="py-3 font-semibold">{ord.orderNumber}</td>
                          <td className="py-3 opacity-80">{new Date(ord.createdAt).toLocaleTimeString()}</td>
                          <td className="py-3 font-semibold">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/10">
                              {ord.orderType}
                            </span>
                          </td>
                          <td className="py-3 opacity-80">{ord.paymentMethod}</td>
                          <td className="py-3 font-bold text-right text-purple-400">{Number(ord.total).toFixed(2)}</td>
                        </tr>
                      ))}
                      {recentOrders.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center opacity-60">
                            No recent sales transactions recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: REPORTS - SALES ANALYTICS
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'reports-sales' && (
            <div className="space-y-6">
              <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider">Product Sales Breakdown</h3>
                    <p className="text-[10px] opacity-60 font-semibold mt-0.5">Itemized quantities and gross profits</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Product Item</th>
                        <th className="py-2.5 font-bold">Category</th>
                        <th className="py-2.5 font-bold text-center">Quantity Sold</th>
                        <th className="py-2.5 font-bold text-right">Average Price</th>
                        <th className="py-2.5 font-bold text-right">Subtotal Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {products.map((prod) => {
                        // Calculate metrics per product
                        let qtySold = 0;
                        let revenue = 0;
                        paidOrders.forEach(ord => {
                          ord.items.forEach(item => {
                            // Find product reference
                            const varMatch = prod.variants.some(v => v.id === item.productVariantId);
                            if (varMatch) {
                              qtySold += item.quantity;
                              revenue += Number(item.unitPrice) * item.quantity;
                            }
                          });
                        });

                        return (
                          <tr key={prod.id} className={`${hoverClass} transition`}>
                            <td className="py-3 font-semibold">{prod.name}</td>
                            <td className="py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-500/10 text-slate-400 font-bold border border-slate-500/10">
                                {prod.category}
                              </span>
                            </td>
                            <td className="py-3 text-center font-bold text-blue-400">{qtySold}</td>
                            <td className="py-3 text-right opacity-80">
                              {prod.variants[0]?.price.toFixed(2) || '0.00'}
                            </td>
                            <td className="py-3 font-bold text-right text-purple-400">{revenue.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      {products.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center opacity-60">
                            No menu products loaded in catalog.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: REPORTS - INVOICES HISTORIES
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'reports-invoices' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Invoices List */}
              <div className={`p-5 rounded-xl border ${cardClass} md:col-span-2 space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Invoice Receipts</h3>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Invoice ID</th>
                        <th className="py-2.5 font-bold">Time</th>
                        <th className="py-2.5 font-bold">Channel</th>
                        <th className="py-2.5 font-bold text-right">Gross Total</th>
                        <th className="py-2.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {paidOrders.map((ord) => (
                        <tr
                          key={ord.id}
                          onClick={() => setSelectedInvoice(ord)}
                          className={`cursor-pointer ${selectedInvoice?.id === ord.id
                            ? isDark ? 'bg-purple-950/25 border-l-2 border-purple-500' : 'bg-purple-50 border-l-2 border-purple-600'
                            : hoverClass
                            } transition`}
                        >
                          <td className="py-3 font-semibold pl-2">{ord.orderNumber}</td>
                          <td className="py-3 opacity-80">{new Date(ord.createdAt).toLocaleTimeString()}</td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/10">
                              {ord.orderType}
                            </span>
                          </td>
                          <td className="py-3 font-bold text-right text-purple-400">{Number(ord.total).toFixed(2)}</td>
                          <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => triggerPrintReceipt(ord)}
                              className={`p-1.5 rounded-lg border ${borderClass} hover:bg-purple-500/20 transition text-purple-400`}
                              title="Print Receipt"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {paidOrders.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center opacity-60">
                            No paid receipts processed today.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invoice Detail Panel */}
              <div className={`p-5 rounded-xl border ${cardClass} h-fit space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Invoice Details</h3>
                {selectedInvoice ? (
                  <div className="space-y-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between font-bold">
                        <span>Invoice ID</span>
                        <span className="text-purple-400">{selectedInvoice.orderNumber}</span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>Created At</span>
                        <span>{new Date(selectedInvoice.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>Payment Mode</span>
                        <span>{selectedInvoice.paymentMethod}</span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>Checkout Type</span>
                        <span>{selectedInvoice.orderType}</span>
                      </div>
                      {selectedInvoice.tableNumber && (
                        <div className="flex justify-between opacity-80">
                          <span>Table No.</span>
                          <span>{selectedInvoice.tableNumber}</span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-b border-purple-950/20 py-3 space-y-2">
                      <span className="font-bold text-[10px] uppercase block tracking-wider opacity-60">Items List</span>
                      {selectedInvoice.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <div>
                            <span className="font-semibold">{item.productVariant?.product?.name}</span>
                            <span className="text-[10px] opacity-60 block">Qty: {item.quantity} x {Number(item.unitPrice).toFixed(2)}</span>
                            {item.modifiers?.length > 0 && (
                              <div className="text-[9px] text-purple-400/80">
                                + {item.modifiers.map(m => m.modifier?.name).join(', ')}
                              </div>
                            )}
                          </div>
                          <span className="font-bold">${(item.quantity * Number(item.unitPrice)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{Number(selectedInvoice.subtotal).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax</span>
                        <span>{Number(selectedInvoice.tax).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm border-t border-purple-950/15 pt-2">
                        <span>Total Paid</span>
                        <span className="text-purple-400">{Number(selectedInvoice.total).toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => triggerPrintReceipt(selectedInvoice)}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-1.5 mt-2"
                    >
                      <Printer className="w-3.5 h-3.5" /> Re-Print Receipt
                    </button>
                  </div>
                ) : (
                  <p className="text-xs opacity-60 text-center py-8">Select an invoice invoice card to view detail logs.</p>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: REPORTS - SHIFT AUDITS
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'reports-shifts' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Register Active Audit */}
              <div className={`p-5 rounded-xl border ${cardClass} md:col-span-2 space-y-4`}>
                <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider">Shift Records</h3>
                  {activeBusinessDay && !activeShift && (
                    <button
                      onClick={() => {
                        setLoginPin('');
                        setAdminOpeningBalance('');
                        setLoginError('');
                      }}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg transition"
                    >
                      Open New Shift
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Employee</th>
                        <th className="py-2.5 font-bold">Opened At</th>
                        <th className="py-2.5 font-bold">Closed At</th>
                        <th className="py-2.5 font-bold text-right">Expected Drawer</th>
                        <th className="py-2.5 font-bold text-right">Actual Counted</th>
                        <th className="py-2.5 font-bold text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {shiftsList.map((s) => {
                        const expected = s.openingBalance + s.cashSales;
                        return (
                          <tr key={s.id} className={`${hoverClass} transition`}>
                            <td className="py-3 font-semibold">{s.employeeName}</td>
                            <td className="py-3 opacity-80">{new Date(s.openedAt).toLocaleTimeString()}</td>
                            <td className="py-3 opacity-80">
                              {s.closedAt ? new Date(s.closedAt).toLocaleTimeString() : (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 animate-pulse">
                                  Running Active
                                </span>
                              )}
                            </td>
                            <td className="py-3 font-bold text-right opacity-80">{expected.toFixed(2)}</td>
                            <td className="py-3 font-bold text-right">
                              {s.actualCash !== null ? `${s.actualCash.toFixed(2)}` : '—'}
                            </td>
                            <td className={`py-3 font-bold text-right ${s.variance === null ? 'text-slate-400' : s.variance === 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                              {s.variance !== null ? `${s.variance >= 0 ? '+' : ''}${s.variance.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {shiftsList.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center opacity-60">
                            No shift registers recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Till Lifecycle Action Card */}
              <div className={`p-5 rounded-xl border ${cardClass} h-fit space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Till Drawer Operations</h3>

                {!activeBusinessDay ? (
                  <div className="space-y-3 text-xs text-center py-4">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto animate-pulse" />
                    <p className="opacity-70">A business day must be opened before drawer operations can execute.</p>
                    <button
                      onClick={handleStartBusinessDay}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition"
                    >
                      Start Business Day
                    </button>
                  </div>
                ) : activeShift ? (
                  <div className="space-y-4 text-xs">
                    <div className="space-y-1.5 p-3 rounded-lg border border-purple-500/10 bg-purple-500/5">
                      <span className="font-bold text-purple-400 text-[10px] uppercase tracking-wider">Active Shift Summary</span>
                      <div className="flex justify-between">
                        <span>Cashier</span>
                        <span className="font-semibold">{activeShift.employeeName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Opening Cash</span>
                        <span className="font-semibold">{activeShift.openingBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cash Sales</span>
                        <span className="font-semibold text-emerald-400">+{activeShift.cashSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-purple-500/10 pt-1.5 mt-1.5 font-bold">
                        <span>Expected Drawer</span>
                        <span>{(activeShift.openingBalance + activeShift.cashSales).toFixed(2)}</span>
                      </div>
                    </div>

                    {!isClosingShift ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsHandover(false);
                            setIsClosingShift(true);
                            setClosingCash('');
                          }}
                          className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5" /> End Shift
                        </button>
                        <button
                          onClick={() => {
                            setIsHandover(true);
                            setIsClosingShift(true);
                            setClosingCash('');
                          }}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Handover
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleCloseShiftSubmit} className="space-y-3 pt-2">
                        <span className="font-bold block uppercase tracking-wider text-[10px] text-rose-400">
                          {isHandover ? 'Confirm Handover Count' : 'Confirm Cash Register Close'}
                        </span>
                        <div>
                          <label className="block text-[10px] font-semibold opacity-70 mb-1">Counted Cash Amount ()</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={closingCash}
                            onChange={e => setClosingCash(e.target.value)}
                            placeholder="0.00"
                            className={`w-full p-2 text-xs rounded-lg border outline-none ${inputClass}`}
                          />
                        </div>
                        {closingCash && (
                          <div className="flex justify-between items-center p-2.5 rounded-lg border border-purple-500/10 bg-purple-500/5 font-semibold text-xs">
                            <span>Variance</span>
                            <span className={
                              parseFloat(closingCash) - (activeShift.openingBalance + activeShift.cashSales) === 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }>
                              ${(parseFloat(closingCash) - (activeShift.openingBalance + activeShift.cashSales)).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsClosingShift(false);
                              setClosingCash('');
                            }}
                            className={`flex-1 py-2 rounded-lg border text-xs font-semibold ${isDark ? 'hover:bg-purple-950/20 text-purple-400' : 'hover:bg-slate-100 text-slate-600'
                              }`}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-[2] py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition"
                          >
                            Close Register
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  // Open Shift Form
                  <form onSubmit={handleOpenShift} className="space-y-3.5 text-xs">
                    <span className="font-semibold block opacity-80">Open New Register Shift</span>
                    {loginError && (
                      <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-rose-400 rounded-lg text-[10px]">
                        {loginError}
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-semibold opacity-70 mb-1">Cashier/Manager PIN Code</label>
                      <input
                        type="password"
                        maxLength={4}
                        required
                        value={loginPin}
                        onChange={e => setLoginPin(e.target.value)}
                        placeholder="••••"
                        className={`w-full p-2.5 text-center text-sm font-bold tracking-widest rounded-lg border outline-none ${inputClass}`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold opacity-70 mb-1">Opening Cash Balance ()</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={adminOpeningBalance}
                        onChange={e => setAdminOpeningBalance(e.target.value)}
                        placeholder="0.00"
                        className={`w-full p-2.5 text-xs rounded-lg border outline-none ${inputClass}`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/30 transition"
                    >
                      Start Shift register
                    </button>
                  </form>
                )}

                {activeBusinessDay && !activeShift && (
                  <div className="pt-3 border-t border-purple-950/15">
                    <button
                      onClick={handleCloseBusinessDay}
                      className="w-full py-2 border border-rose-600/30 hover:bg-rose-600/10 text-rose-400 font-semibold text-xs rounded-lg transition"
                    >
                      End Business Day
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: INVENTORY STOCK
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'inventory' && (
            <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
              <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Ingredient Stock Status</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-purple-950/25 opacity-70">
                      <th className="py-2.5 font-bold">Ingredient Name</th>
                      <th className="py-2.5 font-bold text-center">Remaining Quantity</th>
                      <th className="py-2.5 font-bold text-center">Min Alert Threshold</th>
                      <th className="py-2.5 font-bold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-950/10">
                    {inventory.map((item) => {
                      const isLow = item.quantity <= item.minThreshold;
                      return (
                        <tr key={item.id} className={`${hoverClass} transition`}>
                          <td className="py-3 font-semibold">{item.ingredientName}</td>
                          <td className="py-3 text-center font-bold text-purple-400">
                            {item.quantity.toFixed(1)}
                          </td>
                          <td className="py-3 text-center opacity-80">{item.minThreshold.toFixed(1)}</td>
                          <td className="py-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isLow
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              }`}>
                              {isLow ? '⚠️ LOW STOCK' : '✅ ADEQUATE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {inventory.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center opacity-60">
                          No inventory stock records queried.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: EXPENSES LOG
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'expenses' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* List of expenses */}
              <div className={`p-5 rounded-xl border ${cardClass} md:col-span-2 space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Operational Expenses Logs</h3>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Voucher ID</th>
                        <th className="py-2.5 font-bold">Date</th>
                        <th className="py-2.5 font-bold">Category</th>
                        <th className="py-2.5 font-bold">Description</th>
                        <th className="py-2.5 font-bold text-right">Payout</th>
                        <th className="py-2.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {expenses.map((exp) => (
                        <tr key={exp.id} className={`${hoverClass} transition`}>
                          <td className="py-3 font-semibold">{exp.id}</td>
                          <td className="py-3 opacity-80">{exp.date}</td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/10">
                              {exp.category}
                            </span>
                          </td>
                          <td className="py-3 opacity-85 truncate max-w-[120px]" title={exp.description}>
                            {exp.description || '—'}
                          </td>
                          <td className="py-3 font-bold text-right text-rose-400">{exp.amount.toFixed(2)}</td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition"
                              title="Delete Payout"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {expenses.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center opacity-60">
                            No operational expense logs registered.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add expense voucher */}
              <div className={`p-5 rounded-xl border ${cardClass} h-fit space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Log Expense Voucher</h3>
                <form onSubmit={handleAddExpense} className="space-y-3.5 text-xs">
                  {expenseError && (
                    <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-rose-400 rounded-lg text-[10px]">
                      {expenseError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Expense Category</label>
                    <select
                      value={newExpense.category}
                      onChange={e => setNewExpense(prev => ({ ...prev, category: e.target.value }))}
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    >
                      <option value="Rent">Rent & Utilities</option>
                      <option value="Stock">Stock & Ingredients</option>
                      <option value="Salary">Salaries & Wages</option>
                      <option value="Hardware">Hardware & Equipment</option>
                      <option value="Marketing">Marketing & Promos</option>
                      <option value="Other">Other Payouts</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Date</label>
                    <input
                      type="date"
                      value={newExpense.date}
                      onChange={e => setNewExpense(prev => ({ ...prev, date: e.target.value }))}
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Payout Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newExpense.amount}
                      onChange={e => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={newExpense.description}
                      onChange={e => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter description of operations payout..."
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass} resize-none`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Save Expense
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: SETTINGS - EMPLOYEES
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'settings-employees' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Employee list */}
              <div className={`p-5 rounded-xl border ${cardClass} md:col-span-2 space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Employee Catalog</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Employee Name</th>
                        <th className="py-2.5 font-bold">PIN Code</th>
                        <th className="py-2.5 font-bold">System Role</th>
                        <th className="py-2.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {employees.map((emp) => (
                        <tr key={emp.pin} className={`${hoverClass} transition`}>
                          <td className="py-3 font-semibold">{emp.name}</td>
                          <td className="py-3 font-mono opacity-80">••••</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${emp.role === 'MANAGER'
                              ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                              : emp.role === 'WAITER'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                              }`}>
                              {emp.role}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handleDeleteEmployee(emp.pin)}
                              className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition"
                              title="Delete Employee"
                              disabled={emp.pin === '0000'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add employee card */}
              <div className={`p-5 rounded-xl border ${cardClass} h-fit space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Register Employee</h3>
                <form onSubmit={handleAddEmployee} className="space-y-3.5 text-xs">
                  {employeeError && (
                    <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-rose-400 rounded-lg text-[10px]">
                      {employeeError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Employee Full Name</label>
                    <input
                      type="text"
                      required
                      value={newEmployee.name}
                      onChange={e => setNewEmployee(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Michael Jordan"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Login PIN Code (4 digits)</label>
                    <input
                      type="text"
                      maxLength={4}
                      required
                      value={newEmployee.pin}
                      onChange={e => setNewEmployee(prev => ({ ...prev, pin: e.target.value.replace(/\D/g, '') }))}
                      placeholder="e.g. 4321"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass} font-mono tracking-widest text-center`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">System Role</label>
                    <select
                      value={newEmployee.role}
                      onChange={e => setNewEmployee(prev => ({ ...prev, role: e.target.value as any }))}
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    >
                      <option value="CASHIER">CASHIER (Till Drawer Access)</option>
                      <option value="MANAGER">MANAGER (Full Admin Panels)</option>
                      <option value="WAITER">WAITER (POS Order Taking)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Add Cashier
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: SETTINGS - STORE STAFF (NON-POS)
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'settings-staff' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
              {/* Staff table */}
              <div className={`p-5 rounded-xl border ${cardClass} lg:col-span-2 space-y-4`}>
                <div className="border-b border-purple-950/20 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider">Registered Store Staff</h3>
                  <p className="text-[10px] opacity-70">Staff members registered for office, salary, and service roles (no system PIN or billing capability).</p>
                </div>
                <div className="overflow-x-auto max-h-[550px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Code</th>
                        <th className="py-2.5 font-bold">Name</th>
                        <th className="py-2.5 font-bold">Father's Name</th>
                        <th className="py-2.5 font-bold">Role</th>
                        <th className="py-2.5 font-bold text-center">CNIC</th>
                        <th className="py-2.5 font-bold text-right">Salary</th>
                        <th className="py-2.5 text-center font-bold">Status</th>
                        <th className="py-2.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {staffList.map((s) => (
                        <tr key={s.code} className={`${hoverClass} transition`}>
                          <td className="py-3 font-mono font-semibold">{s.code}</td>
                          <td className="py-3 font-semibold">{s.name}</td>
                          <td className="py-3 opacity-80">{s.fatherName || '—'}</td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/10">
                              {s.role}
                            </span>
                          </td>
                          <td className="py-3 font-mono opacity-80 text-center">{s.cnic || '—'}</td>
                          <td className="py-3 font-bold text-right text-purple-400">
                            {Number(s.salary).toFixed(0)}
                          </td>
                          <td className="py-3 text-center">
                            <span
                              onClick={() => toggleStaffStatus(s)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:opacity-85 transition ${s.status === 'DISABLED'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}
                              title="Click to toggle status"
                            >
                              {s.status || 'ACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setNewStaff({
                                    code: s.code,
                                    name: s.name,
                                    fatherName: s.fatherName || '',
                                    role: ['Waiter', 'Barista', 'Kitchen'].includes(s.role) ? s.role : 'Other',
                                    cnic: s.cnic || '',
                                    salary: s.salary.toString(),
                                    status: s.status || 'ACTIVE'
                                  });
                                  if (!['Waiter', 'Barista', 'Kitchen'].includes(s.role)) {
                                    setCustomRoleInput(s.role);
                                    setShowCustomRoleInput(true);
                                  } else {
                                    setCustomRoleInput('');
                                    setShowCustomRoleInput(false);
                                  }
                                }}
                                className="p-1 rounded hover:bg-purple-500/20 text-purple-400 transition"
                                title="Edit Staff"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteStaff(s.code)}
                                className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition"
                                title="Delete Staff"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {staffList.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center opacity-60">
                            No store staff members registered.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add staff card */}
              <div className={`p-5 rounded-xl border ${cardClass} h-fit space-y-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider border-b border-purple-950/20 pb-3">Register Store Staff</h3>
                <form onSubmit={handleAddStaff} className="space-y-3.5 text-xs">
                  {staffError && (
                    <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-rose-400 rounded-lg text-[10px]">
                      {staffError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Employee Code</label>
                    <input
                      type="text"
                      required
                      value={newStaff.code}
                      onChange={e => setNewStaff(prev => ({ ...prev, code: e.target.value }))}
                      placeholder="e.g. EMP-101"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Employee Full Name</label>
                    <input
                      type="text"
                      required
                      value={newStaff.name}
                      onChange={e => setNewStaff(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Father's Name</label>
                    <input
                      type="text"
                      value={newStaff.fatherName}
                      onChange={e => setNewStaff(prev => ({ ...prev, fatherName: e.target.value }))}
                      placeholder="e.g. Richard Doe"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Employee Role</label>
                    <select
                      value={newStaff.role}
                      onChange={e => {
                        const val = e.target.value;
                        setNewStaff(prev => ({ ...prev, role: val }));
                        if (val === 'Other') {
                          setShowCustomRoleInput(true);
                        } else {
                          setShowCustomRoleInput(false);
                        }
                      }}
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    >
                      <option value="Waiter">Waiter</option>
                      <option value="Barista">Barista</option>
                      <option value="Kitchen">Kitchen Staff</option>
                      <option value="Other">Custom Role...</option>
                    </select>
                  </div>

                  {showCustomRoleInput && (
                    <div>
                      <label className="block text-[10px] font-semibold opacity-70 mb-1">Custom Role Name</label>
                      <input
                        type="text"
                        required
                        value={customRoleInput}
                        onChange={e => setCustomRoleInput(e.target.value)}
                        placeholder="e.g. Cleaner, Guard"
                        className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">CNIC Number</label>
                    <input
                      type="text"
                      value={newStaff.cnic}
                      onChange={e => setNewStaff(prev => ({ ...prev, cnic: e.target.value }))}
                      placeholder="e.g. 35202-1234567-1"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold opacity-70 mb-1">Basic Monthly Salary</label>
                    <input
                      type="number"
                      required
                      value={newStaff.salary}
                      onChange={e => setNewStaff(prev => ({ ...prev, salary: e.target.value }))}
                      placeholder="e.g. 30000"
                      className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Save Staff Member
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────
              SUBPAGE: SETTINGS - CATALOG ITEMS
              ─────────────────────────────────────────────────────────────── */}
          {activeTab === 'settings-items' && (
            <div className="space-y-6">
              {/* Header with actions at top */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-purple-950/20 pb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider">Catalog Menu Items</h2>
                  <p className="text-[10px] opacity-70">Manage your POS terminal product catalog and menu groups.</p>
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setNewProduct({ name: '', price: '', category: categories[0]?.name || '', sku: '', status: 'ACTIVE', bgColor: '', textColor: '' });
                      setProductError('');
                      setIsProductModalOpen(true);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 transition flex items-center gap-1.5 text-[10px]"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Add Product
                  </button>
                  <button
                    onClick={() => {
                      setEditingCategory(null);
                      setNewCategory({ name: '', status: 'ACTIVE', bgColor: '', textColor: '' });
                      setCategoryError('');
                      setIsCategoryModalOpen(true);
                    }}
                    className="px-4 py-2 bg-purple-950/35 hover:bg-purple-950/50 border border-purple-800/30 text-purple-300 font-bold rounded-lg transition flex items-center gap-1.5 text-[10px]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Category
                  </button>
                </div>
              </div>

              {/* Full width products table */}
              <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                <div className="border-b border-purple-950/20 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider">Products List</h3>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Item Name</th>
                        <th className="py-2.5 font-bold">Category</th>
                        <th className="py-2.5 font-bold">SKU Code</th>
                        <th className="py-2.5 font-bold text-right">Standard Price</th>
                        <th className="py-2.5 font-bold text-center">Status</th>
                        <th className="py-2.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {products.map((prod) => (
                        <tr key={prod.id} className={`${hoverClass} transition`}>
                          <td className="py-3 font-semibold">{prod.name}</td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 font-bold border border-purple-500/10">
                              {prod.category}
                            </span>
                          </td>
                          <td className="py-3 font-mono opacity-80">{prod.variants[0]?.sku || '—'}</td>
                          <td className="py-3 font-bold text-right text-purple-400">
                            {prod.variants[0]?.price.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 text-center">
                            <span
                              onClick={() => toggleProductStatus(prod)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:opacity-85 transition ${prod.status === 'DISABLED'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}
                              title="Click to toggle status"
                            >
                              {prod.status || 'ACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingProduct(prod);
                                  setNewProduct({
                                    name: prod.name,
                                    price: prod.variants[0]?.price.toString() || '',
                                    category: prod.category,
                                    sku: prod.variants[0]?.sku || '',
                                    status: prod.status || 'ACTIVE',
                                    bgColor: prod.bgColor || '',
                                    textColor: prod.textColor || ''
                                  });
                                  setProductError('');
                                  setIsProductModalOpen(true);
                                }}
                                className="p-1 rounded hover:bg-purple-500/20 text-purple-400 transition"
                                title="Edit Item"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(prod.id)}
                                className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {products.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center opacity-60">
                            No menu products loaded in catalog.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Categories Table Section */}
              <div className={`p-5 rounded-xl border ${cardClass} space-y-4`}>
                <div className="border-b border-purple-950/20 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider">Menu Categories</h3>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-purple-950/25 opacity-70">
                        <th className="py-2.5 font-bold">Category Name</th>
                        <th className="py-2.5 font-bold text-center">Status</th>
                        <th className="py-2.5 text-center font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950/10">
                      {categories.map((cat) => (
                        <tr key={cat.name} className={`${hoverClass} transition`}>
                          <td className="py-3 font-semibold">{cat.name}</td>
                          <td className="py-3 text-center">
                            <span
                              onClick={() => toggleCategoryStatus(cat)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer hover:opacity-85 transition ${cat.status === 'DISABLED'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                }`}
                              title="Click to toggle status"
                            >
                              {cat.status}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingCategory(cat);
                                  setNewCategory({
                                    name: cat.name,
                                    status: cat.status,
                                    bgColor: cat.bgColor || '',
                                    textColor: cat.textColor || ''
                                  });
                                  setCategoryError('');
                                  setIsCategoryModalOpen(true);
                                }}
                                className="p-1 rounded hover:bg-purple-500/20 text-purple-400 transition"
                                title="Edit Category"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(cat.name)}
                                className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition"
                                title="Delete Category"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {categories.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center opacity-60">
                            No categories added yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modals placed inside settings-items */}
              {isProductModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className={`p-6 rounded-xl border ${cardClass} w-full max-w-md space-y-4 shadow-xl`}>
                    <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider">
                        {editingProduct ? 'Edit Menu Product' : 'Create Menu Product'}
                      </h3>
                      <button
                        onClick={() => {
                          setIsProductModalOpen(false);
                          setEditingProduct(null);
                        }}
                        className="text-xs text-purple-400 hover:text-purple-300 font-bold transition"
                      >
                        Close
                      </button>
                    </div>
                    <form onSubmit={handleAddProduct} className="space-y-3.5 text-xs">
                      {productError && (
                        <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-rose-400 rounded-lg text-[10px]">
                          {productError}
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">Product Name</label>
                        <input
                          type="text"
                          required
                          value={newProduct.name}
                          onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Vanilla Iced Latte"
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">Menu Category</label>
                        <select
                          required
                          value={newProduct.category}
                          onChange={e => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                        >
                          {categories.length === 0 ? (
                            <option value="">No categories available - please add one first</option>
                          ) : (
                            categories.map(cat => (
                              <option key={cat.name} value={cat.name}>{cat.name}</option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">Sales Price ()</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={newProduct.price}
                          onChange={e => setNewProduct(prev => ({ ...prev, price: e.target.value }))}
                          placeholder="0.00"
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">SKU identifier (Product Code)</label>
                        <input
                          type="text"
                          required
                          value={newProduct.sku}
                          onChange={e => setNewProduct(prev => ({ ...prev, sku: e.target.value }))}
                          placeholder="SKU-XXXXXX"
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass} font-mono`}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">Status</label>
                        <select
                          required
                          value={newProduct.status}
                          onChange={e => setNewProduct(prev => ({ ...prev, status: e.target.value as any }))}
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="DISABLED">Disabled</option>
                        </select>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold opacity-70 mb-1">Background Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={newProduct.bgColor || '#000000'}
                              onChange={e => setNewProduct(prev => ({ ...prev, bgColor: e.target.value }))}
                              className="h-10 w-10 p-1 rounded cursor-pointer border border-surface-200"
                            />
                            <input
                              type="text"
                              value={newProduct.bgColor}
                              onChange={e => setNewProduct(prev => ({ ...prev, bgColor: e.target.value }))}
                              placeholder="#hex or color"
                              className={`flex-1 p-2.5 rounded-lg border outline-none ${inputClass}`}
                            />
                          </div>
                        </div>

                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold opacity-70 mb-1">Text Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={newProduct.textColor || '#ffffff'}
                              onChange={e => setNewProduct(prev => ({ ...prev, textColor: e.target.value }))}
                              className="h-10 w-10 p-1 rounded cursor-pointer border border-surface-200"
                            />
                            <input
                              type="text"
                              value={newProduct.textColor}
                              onChange={e => setNewProduct(prev => ({ ...prev, textColor: e.target.value }))}
                              placeholder="#hex or color"
                              className={`flex-1 p-2.5 rounded-lg border outline-none ${inputClass}`}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" /> {editingProduct ? 'Save Changes' : 'Create Product'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {isCategoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className={`p-6 rounded-xl border ${cardClass} w-full max-w-sm space-y-4 shadow-xl`}>
                    <div className="flex justify-between items-center border-b border-purple-950/20 pb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider">
                        {editingCategory ? 'Edit Category' : 'Add New Category'}
                      </h3>
                      <button
                        onClick={() => {
                          setIsCategoryModalOpen(false);
                          setEditingCategory(null);
                        }}
                        className="text-xs text-purple-400 hover:text-purple-300 font-bold transition"
                      >
                        Close
                      </button>
                    </div>
                    <form onSubmit={handleAddCategory} className="space-y-3.5 text-xs">
                      {categoryError && (
                        <div className="p-2 border border-rose-500/20 bg-rose-500/5 text-rose-400 rounded-lg text-[10px]">
                          {categoryError}
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">Category Name</label>
                        <input
                          type="text"
                          required
                          value={newCategory.name}
                          onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Desserts"
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold opacity-70 mb-1">Status</label>
                        <select
                          required
                          value={newCategory.status}
                          onChange={e => setNewCategory(prev => ({ ...prev, status: e.target.value as any }))}
                          className={`w-full p-2.5 rounded-lg border outline-none ${inputClass}`}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="DISABLED">Disabled</option>
                        </select>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold opacity-70 mb-1">Background Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={newCategory.bgColor || '#000000'}
                              onChange={e => setNewCategory(prev => ({ ...prev, bgColor: e.target.value }))}
                              className="h-10 w-10 p-1 rounded cursor-pointer border border-surface-200"
                            />
                            <input
                              type="text"
                              value={newCategory.bgColor}
                              onChange={e => setNewCategory(prev => ({ ...prev, bgColor: e.target.value }))}
                              placeholder="#hex or color"
                              className={`flex-1 p-2.5 rounded-lg border outline-none ${inputClass}`}
                            />
                          </div>
                        </div>

                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold opacity-70 mb-1">Text Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={newCategory.textColor || '#ffffff'}
                              onChange={e => setNewCategory(prev => ({ ...prev, textColor: e.target.value }))}
                              className="h-10 w-10 p-1 rounded cursor-pointer border border-surface-200"
                            />
                            <input
                              type="text"
                              value={newCategory.textColor}
                              onChange={e => setNewCategory(prev => ({ ...prev, textColor: e.target.value }))}
                              placeholder="#hex or color"
                              className={`flex-1 p-2.5 rounded-lg border outline-none ${inputClass}`}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" /> Save Category
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings-tax' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-purple-950/20 pb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider">Tax Configurations</h2>
                  <p className="text-[10px] opacity-70">Enable or disable VAT/sales tax charges and set custom tax rates.</p>
                </div>
              </div>

              <div className={`p-6 rounded-xl border ${cardClass} max-w-md space-y-6 shadow-lg relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl" />

                {/* Tax Toggle Option */}
                <div className="flex items-center justify-between pb-4 border-b border-purple-950/10">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold uppercase tracking-wider block">Enable Cart Tax</label>
                    <span className="text-[10px] opacity-60">Apply custom tax percentage on cashier billing total.</span>
                  </div>
                  <button
                    onClick={async () => {
                      const nextVal = !settings.taxEnabled;
                      await handleUpdateTaxSettings(nextVal, settings.taxRate);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.taxEnabled ? 'bg-purple-600' : 'bg-purple-950/30'
                      }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${settings.taxEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>

                {/* Tax Percentage Option */}
                <div className="space-y-2.5">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold uppercase tracking-wider block">Tax Percentage (%)</label>
                    <span className="text-[10px] opacity-60">Set the default tax rate applied to checkout subtotal.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.taxRate}
                      disabled={!settings.taxEnabled}
                      onChange={async (e) => {
                        const rate = parseFloat(e.target.value);
                        setSettings((prev: any) => ({ ...prev, taxRate: isNaN(rate) ? '' : rate }));
                      }}
                      onBlur={async () => {
                        const rate = parseFloat(settings.taxRate) || 0;
                        await handleUpdateTaxSettings(settings.taxEnabled, rate);
                      }}
                      className={`w-28 p-2.5 rounded-lg border outline-none font-semibold text-center transition ${inputClass} ${!settings.taxEnabled ? 'opacity-40 cursor-not-allowed' : 'focus:ring-2 focus:ring-purple-500/20'
                        }`}
                    />
                    <span className="text-xs font-bold opacity-75">%</span>
                  </div>
                </div>

                <div className="text-[9px] opacity-50 bg-purple-950/5 p-3 rounded-lg border border-purple-950/5">
                  Tax modifications are applied dynamically in real-time to all checkout subtotal sums calculated by active register clients.
                </div>
              </div>
            </div>
          )}
          {activeTab === 'settings-printer' && (
            <PrinterSetupTab
              cardClass={cardClass}
              inputClass={inputClass}
              isDark={isDark}
              textMuted={textMuted}
              borderClass={borderClass}
              initialMode={settings?.printerMode || 'usb'}
              initialTarget={settings?.printerTarget || 'POSPrinter'}
              initialLogo={settings?.printerLogoBase64 || ''}
              initialShowPrintPreview={settings?.showPrintPreview || false}
              initialPrinterType={settings?.printerType || 'esc-pos'}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINTER SETUP TAB COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface InstalledPrinter {
  name: string;
  driver: string;
  port: string;
  isUsb: boolean;
  status: string;
}

function PrinterSetupTab({
  cardClass, inputClass, isDark, textMuted, borderClass, initialMode, initialTarget, initialLogo, initialShowPrintPreview, initialPrinterType
}: {
  cardClass: string; inputClass: string; isDark: boolean; textMuted: string;
  borderClass: string; initialMode: 'usb' | 'network'; initialTarget: string; initialLogo?: string; initialShowPrintPreview?: boolean; initialPrinterType?: 'esc-pos' | 'html';
}) {
  const [mode, setMode] = useState<'usb' | 'network'>(initialMode);
  const [target, setTarget] = useState(initialTarget);
  const [logo, setLogo] = useState(initialLogo || '');
  const [showPrintPreview, setShowPrintPreview] = useState(initialShowPrintPreview || false);
  const [printerType, setPrinterType] = useState<'esc-pos' | 'html'>(initialPrinterType || 'esc-pos');
  const [printers, setPrinters] = useState<InstalledPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [selectedPrinterName, setSelectedPrinterName] = useState('');
  const [logs, setLogs] = useState<any[]>([]);

  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  const fetchLogs = async () => {
    if (api && api.getPrintLogs) {
      try {
        const list = await api.getPrintLogs();
        setLogs(list);
      } catch (err) {
        console.error('Failed to load print logs:', err);
      }
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleScan = async () => {
    if (!api) return showStatus('Not running in Electron. Cannot scan printers.', false);
    setScanning(true);
    setScanDone(false);
    try {
      const list: InstalledPrinter[] = await api.getInstalledPrinters();
      setPrinters(list);
      setScanDone(true);
      if (list.length === 0) showStatus('No printers found. Make sure your printer is plugged in and installed.', false);
    } catch (err: any) {
      showStatus('Scan failed: ' + err.message, false);
    } finally {
      setScanning(false);
    }
  };

  const handleSelectPrinter = (printer: InstalledPrinter) => {
    setSelectedPrinterName(printer.name);
    const detectedMode: 'usb' | 'network' = printer.isUsb ? 'usb' : 'network';
    setMode(detectedMode);
    // Since we now use Electron webContents print directly, we can just use the printer name!
    setTarget(printer.name);
  };

  const handleTestPrint = async () => {
    if (!target.trim()) return showStatus('Please enter a printer target first.', false);
    if (!api) return showStatus('Not running in Electron.', false);
    setTesting(true);
    try {
      const res = await api.testPrint(target.trim(), mode, printerType);
      if (res.success) {
        showStatus('✓ Test print sent successfully! Check your printer.', true);
      } else {
        showStatus('✗ Print failed: ' + (res.error || 'Unknown error'), false);
      }
    } catch (err: any) {
      showStatus('✗ Error: ' + err.message, false);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!target.trim()) return showStatus('Please enter a printer target first.', false);
    if (!api) {
      localStorage.setItem('test-printerLogoBase64', logo);
      return showStatus('✓ Saved locally for browser testing.', true);
    }
    setSaving(true);
    try {
      const res = await api.savePrinterSettings(target.trim(), mode, logo, showPrintPreview, printerType);
      if (res.success) {
        showStatus('✓ Printer settings saved successfully!', true);
      } else {
        showStatus('✗ Save failed: ' + (res.error || 'Unknown error'), false);
      }
    } catch (err: any) {
      showStatus('✗ Error: ' + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      showStatus('Logo file too large. Please keep it under 200KB.', false);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setLogo(ev.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const mutedTxt = isDark ? 'text-purple-300/50' : 'text-slate-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4 ${borderClass}`}>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">Printer Setup</h2>
          <p className={`text-[10px] mt-0.5 ${textMuted}`}>Connect and configure your receipt printer. Supports USB and Network printers.</p>
        </div>
      </div>

      {/* Status Toast */}
      {statusMsg && (
        <div className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-semibold border ${
          statusMsg.ok
            ? isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <span className="text-base">{statusMsg.ok ? '✓' : '✗'}</span>
          {statusMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Left: Printer Scanner */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-4 relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">Installed Printers</h3>
              <p className={`text-[10px] mt-0.5 ${textMuted}`}>Auto-detect printers installed on this computer.</p>
            </div>
            <button
              id="btn-scan-printers"
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition shadow-lg shadow-purple-900/30"
            >
              <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Scan Printers'}
            </button>
          </div>

          {/* Printer List */}
          <div className="space-y-2 min-h-[120px]">
            {!scanDone && !scanning && (
              <div className={`flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed ${isDark ? 'border-purple-950/40' : 'border-slate-200'}`}>
                <Printer className={`w-8 h-8 mb-2 ${mutedTxt}`} />
                <p className={`text-[10px] font-semibold ${mutedTxt}`}>Click "Scan Printers" to detect installed printers</p>
              </div>
            )}
            {scanning && (
              <div className={`flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed ${isDark ? 'border-purple-950/40' : 'border-slate-200'}`}>
                <RefreshCw className={`w-8 h-8 mb-2 animate-spin ${mutedTxt}`} />
                <p className={`text-[10px] font-semibold ${mutedTxt}`}>Scanning for printers...</p>
              </div>
            )}
            {scanDone && printers.length === 0 && (
              <div className={`flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed ${isDark ? 'border-rose-900/30' : 'border-rose-200'}`}>
                <AlertTriangle className="w-8 h-8 mb-2 text-rose-400" />
                <p className="text-[10px] font-semibold text-rose-400">No printers found. Install your printer driver first.</p>
              </div>
            )}
            {scanDone && printers.map((p, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                  selectedPrinterName === p.name
                    ? isDark ? 'border-purple-500/50 bg-purple-600/10' : 'border-purple-400 bg-purple-50'
                    : isDark ? 'border-purple-950/30 hover:border-purple-800/50 hover:bg-purple-900/10' : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50/50'
                }`}
                onClick={() => handleSelectPrinter(p)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    p.isUsb
                      ? isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                      : isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight">{p.name}</p>
                    <p className={`text-[10px] ${textMuted}`}>{p.port} · {p.isUsb ? 'USB' : 'Network/Other'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    p.status === 'Ready'
                      ? isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                      : isDark ? 'bg-rose-500/15 text-rose-400' : 'bg-rose-100 text-rose-700'
                  }`}>{p.status}</span>
                  {selectedPrinterName === p.name && (
                    <Check className="w-4 h-4 text-purple-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Printer Configuration */}
        <div className={`p-5 rounded-2xl border ${cardClass} space-y-5 relative overflow-hidden`}>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider">Printer Configuration</h3>
            <p className={`text-[10px] mt-0.5 ${textMuted}`}>Set connection mode and printer target, then test your connection.</p>
          </div>

          {/* Mode Toggle */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider block opacity-70">Connection Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(['usb', 'network'] as const).map((m) => (
                <button
                  key={m}
                  id={`btn-mode-${m}`}
                  onClick={() => {
                    setMode(m);
                    setTarget(m === 'usb' ? 'POSPrinter' : '');
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition ${
                    mode === m
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30'
                      : isDark ? 'border-purple-950/30 text-purple-400/70 hover:border-purple-800/50' : 'border-slate-200 text-slate-500 hover:border-purple-300'
                  }`}
                >
                  {m === 'usb' ? '🔌 USB (Share)' : '🌐 Network (IP)'}
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Print Style Toggle */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider block opacity-70">Receipt Print Style</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'esc-pos', label: '📄 ESC/POS (Text)', desc: 'Recommended. Native printer code, fast, correct width, auto-cut.' },
                { type: 'html', label: '🎨 HTML (Graphic)', desc: 'Allows custom fonts & image logo, but requires manual driver scaling.' }
              ].map((style) => (
                <button
                  key={style.type}
                  id={`btn-style-${style.type}`}
                  type="button"
                  onClick={() => setPrinterType(style.type as 'esc-pos' | 'html')}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition ${
                    printerType === style.type
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30'
                      : isDark ? 'border-purple-950/30 text-purple-400/70 hover:border-purple-800/50' : 'border-slate-200 text-slate-500 hover:border-purple-300'
                  }`}
                  title={style.desc}
                >
                  {style.label}
                </button>
              ))}
            </div>
            <p className={`text-[9px] leading-tight ${textMuted}`}>
              {printerType === 'esc-pos' 
                ? '✓ Selected native ESC/POS. Best for thermal receipts. Perfect fit, no missing margins, cash drawer & cutter work reliably.' 
                : '⚠ Selected HTML. Best if you need a graphical logo, but you must set the printer properties in Windows to exactly 80mm to avoid scaling issues.'}
            </p>
          </div>

          {/* Target Input */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider block opacity-70">
              {mode === 'usb' ? 'Windows Share Name' : 'Printer IP Address'}
            </label>
            <input
              id="input-printer-target"
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={mode === 'usb' ? 'e.g. POSPrinter' : 'e.g. 192.168.1.50'}
              className={`w-full p-2.5 rounded-xl border outline-none font-mono text-xs transition ${inputClass} focus:ring-2 focus:ring-purple-500/20`}
            />
            <p className={`text-[10px] ${textMuted}`}>
              {mode === 'usb'
                ? 'Share your USB printer in Windows Settings → Printers → Sharing tab → set share name here.'
                : 'Enter the IP address of your network/WiFi receipt printer (port 9100 is used automatically).'}
            </p>
          </div>

          {/* Step-by-step guide for USB */}
          {mode === 'usb' && (
            <div className={`p-3.5 rounded-xl text-[10px] leading-relaxed space-y-1.5 ${
              isDark ? 'bg-blue-500/5 border border-blue-500/10 text-blue-300/70' : 'bg-blue-50 border border-blue-100 text-blue-700'
            }`}>
              <p className="font-bold text-[10px] uppercase tracking-wider">📋 USB Setup Guide</p>
              <p>1. Open <strong>Windows Settings → Printers & Scanners</strong></p>
              <p>2. Click your printer → <strong>Printer Properties → Sharing tab</strong></p>
              <p>3. Check <strong>"Share this printer"</strong> and set name to <strong>POSPrinter</strong></p>
              <p>4. Click OK, then click <strong>"Send Test Print"</strong> below.</p>
            </div>
          )}

          {/* Print Preview Toggle */}
          <div className="pt-2 border-t border-surface-200">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={showPrintPreview} onChange={e => setShowPrintPreview(e.target.checked)} />
                <div className={`block w-10 h-6 rounded-full transition-colors \${showPrintPreview ? 'bg-purple-500' : isDark ? 'bg-surface-200' : 'bg-surface-300'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform \${showPrintPreview ? 'translate-x-4' : ''}`}></div>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider block opacity-90">Show Print Dialog / Preview</span>
                <span className={`text-[10px] block \${textMuted}`}>Useful for testing. If enabled, the native Windows Print dialog will appear before printing.</span>
              </div>
            </label>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2 pt-2 border-t border-surface-200">
            <label className="text-[10px] font-bold uppercase tracking-wider block opacity-70">
              Receipt Logo (Optional)
            </label>
            <div className="flex items-center gap-4">
              {logo ? (
                <div className="relative group shrink-0">
                  <img src={logo} alt="Receipt Logo" className="w-16 h-16 object-contain border rounded bg-white p-1" />
                  <button
                    onClick={() => setLogo('')}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Logo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className={`w-16 h-16 shrink-0 flex items-center justify-center border-2 border-dashed rounded ${borderClass} opacity-50`}>
                  <Image className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <input
                  type="file"
                  accept="image/png, image/jpeg"
                  onChange={handleLogoUpload}
                  className={`w-full text-[10px] file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-semibold file:bg-purple-500/10 file:text-purple-600 hover:file:bg-purple-500/20 cursor-pointer ${textMuted}`}
                />
                <p className={`text-[9px] mt-1 ${textMuted}`}>Max 200KB. PNG or JPG. Pure black/white images print best.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 pt-1">
            <button
              id="btn-test-print"
              onClick={handleTestPrint}
              disabled={testing || !target.trim()}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-purple-500/40 text-purple-400 hover:bg-purple-600/10 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              <Printer className={`w-3.5 h-3.5 ${testing ? 'animate-pulse' : ''}`} />
              {testing ? 'Sending Test Print...' : 'Send Test Print'}
            </button>
            <button
              id="btn-save-printer"
              onClick={handleSave}
              disabled={saving || !target.trim()}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white shadow-lg shadow-purple-900/30 transition flex items-center justify-center gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Printer Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Print Logs Section */}
      <div className={`p-5 rounded-2xl border ${cardClass} space-y-4 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider">Real-time Print logs & status</h3>
          <p className={`text-[10px] mt-0.5 ${textMuted}`}>Live activity logs of printing actions executed by client terminals.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${borderClass} opacity-60 text-[10px] font-bold uppercase tracking-wider`}>
                <th className="py-2.5">Time</th>
                <th className="py-2.5">Order Number</th>
                <th className="py-2.5">Destination</th>
                <th className="py-2.5">Mode</th>
                <th className="py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-950/10">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`py-6 text-center ${textMuted} italic`}>No print jobs recorded in this session.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-2.5 font-medium opacity-80">{log.timestamp}</td>
                    <td className="py-2.5 font-bold">{log.orderNumber}</td>
                    <td className="py-2.5 font-mono text-[10px]">{log.target}</td>
                    <td className="py-2.5 uppercase tracking-wider text-[10px]">{log.mode}</td>
                    <td className="py-2.5 text-right">
                      {log.status === 'printing' && (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-500 animate-pulse text-[10px] uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping mr-1" /> Printing...
                        </span>
                      )}
                      {log.status === 'success' && (
                        <span className="font-bold text-emerald-500 text-[10px] uppercase">✓ Printed</span>
                      )}
                      {log.status === 'error' && (
                        <div className="inline-block text-right">
                          <span className="font-bold text-rose-500 text-[10px] uppercase block">✗ Failed</span>
                          {log.error && <span className="text-[9px] text-rose-400 opacity-80 block font-normal max-w-[200px] truncate" title={log.error}>{log.error}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
