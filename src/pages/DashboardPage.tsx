import { useEffect, useMemo, useState } from 'react';
import { confirmOrder, preparingOrder, rejectOrder } from '../api/dashboardApi';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useOrders } from '../hooks/useOrders';
import OrderCard from '../components/OrderCard';
import NewOrderOverlay from '../components/NewOrderOverlay';
import HistoryTable from '../components/HistoryTable';
import StatCard from '../components/StatCard';
import { StatCardSkeleton, OrderCardSkeleton } from '../components/Skeletons';
import { useToast } from '../context/ToastContext';
import { Order, OrderSectionKey } from '../types';
import { useAutoPrintKot } from '../hooks/useAutoPrintKot';
import { KitchenTicket } from '../components/orders/KitchenTicket';
import { NotificationBanner } from '../components/NotificationBanner';

import todays_orders_icon from '../assets/todays_orders_icon.svg';
import todays_revenue_icon from '../assets/todays_revenue_icon.svg';
import prep_time_icon from '../assets/prep_time_icon.svg';
import rejection_rate_icon from '../assets/rejection_rate_icon.svg';

import pending_icon from '../assets/pending_icon.svg';
import preparing_icon from '../assets/preparing_icon.svg';
import ready_ordres_icon from '../assets/ready_ordres_icon.svg';
import order_history_icon from '../assets/order_history_icon.svg';

const PendingIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

const PreparingIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 13.8a4.5 4.5 0 1 1 2.6-8.3 5 5 0 0 1 6.8 0 4.5 4.5 0 1 1 2.6 8.3" />
    <path d="M6 13.8h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4z" />
    <line x1="10" y1="17.8" x2="10" y2="19.8" />
    <line x1="14" y1="17.8" x2="14" y2="19.8" />
  </svg>
);

const ReadyIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const HistoryIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const orderSections = [
  { key: 'PENDING', label: 'Pending', Icon: PendingIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'PREPARING', label: 'Preparing', Icon: PreparingIcon, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'READY', label: 'Ready', Icon: ReadyIcon, color: 'text-slate-500', bg: 'bg-slate-50' },
  { key: 'HISTORY', label: 'Order History', Icon: HistoryIcon, color: 'text-slate-500', bg: 'bg-slate-50' }
] as const;

const DashboardPage = () => {
  const [range, setRange] = useState('today');
  const [activeSection, setActiveSection] = useState<OrderSectionKey>('PENDING');
  const [newOrderModal, setNewOrderModal] = useState<Order | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { showToast } = useToast();
  const { stats, loading: loadingStats, error: statsError, refreshStats } = useDashboardStats(range);
  const { orders, newOrder, setNewOrder, refreshOrders, updateLocalOrder, loading: loadingOrders, error: ordersError } = useOrders();

  const [autoPrintEnabled, setAutoPrintEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hivago_auto_print_kot') === 'true';
    }
    return false;
  });

  const handleToggleAutoPrint = () => {
    const newValue = !autoPrintEnabled;
    setAutoPrintEnabled(newValue);
    localStorage.setItem('hivago_auto_print_kot', String(newValue));
    showToast(`Auto-print KOT ${newValue ? 'Enabled' : 'Disabled'}`, 'info');
  };

  const autoKot = useAutoPrintKot(autoPrintEnabled);

  const handleOrderUpdate = (updatedOrder: Order) => {
    updateLocalOrder(updatedOrder);
    refreshStats(true);
    
    let type: 'success' | 'info' = 'success';
    let msg = `Order #${updatedOrder.orderNumber} is now ${updatedOrder.status.toLowerCase()}`;
    
    if (updatedOrder.status === 'REJECTED' || updatedOrder.status === 'CANCELLED') {
      type = 'info';
      msg = `Order #${updatedOrder.orderNumber} has been ${updatedOrder.status.toLowerCase()}`;
    } else if (updatedOrder.status === 'REFUNDING') {
      type = 'success';
      msg = `Refund initiated for Order #${updatedOrder.orderNumber}`;
    }
    
    showToast(msg, type);
  };

  useEffect(() => {
    if (newOrder) {
      setNewOrderModal(newOrder);
    } else {
      setNewOrderModal(null);
    }
  }, [newOrder]);

  // Dismiss modal if order in state list is no longer PENDING
  useEffect(() => {
    if (newOrderModal) {
      const activeOrderInList = orders.find(
        o => o.id === newOrderModal.id || o.orderNumber === newOrderModal.orderNumber
      );
      if (activeOrderInList && activeOrderInList.status !== 'PENDING') {
        setNewOrderModal(null);
        setNewOrder(null);
      }
    }
  }, [orders, newOrderModal]);

  const handleConfirm = async (prepTime: number, deliveryPartner: 'HIVAGO' | 'RESTAURANT') => {
    if (!newOrderModal) return;
    setActionLoading(true);
    try {
      const updatedOrder = await preparingOrder(newOrderModal.id, prepTime, deliveryPartner);

      handleOrderUpdate(updatedOrder);
      setNewOrderModal(null);
      setNewOrder(null);
      
      // Auto-print KOT if enabled
      autoKot.printOnAccept(updatedOrder.id);
    } catch (err: any) {
      console.error('Failed to mark order as preparing:', err);
      showToast(err.response?.data?.message || err.message || 'Failed to accept order', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!newOrderModal) return;
    setActionLoading(true);
    try {
      const updatedOrder = await rejectOrder(newOrderModal.id, reason);
      handleOrderUpdate(updatedOrder);
      setNewOrderModal(null);
      setNewOrder(null);
    } catch (err: any) {
      console.error('Failed to reject order:', err);
      showToast(err.response?.data?.message || err.message || 'Failed to reject order', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const sectionCounts = useMemo(() => {
    const counts = {
      PENDING: 0,
      PREPARING: 0,
      READY: 0,
      HISTORY: 0
    } as Record<OrderSectionKey, number>;

    orders.forEach(order => {
      if (order.status === 'PENDING') counts.PENDING += 1;
      if (order.status === 'PREPARING') counts.PREPARING += 1;
      if (order.status === 'READY') counts.READY += 1;
      if (order.status === 'PICKED_UP' || order.status === 'DELIVERED' || order.status === 'REJECTED' || order.status === 'CANCELLED' || order.status === 'REFUNDING') counts.HISTORY += 1;
    });

    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (activeSection === 'HISTORY') {
        return order.status === 'PICKED_UP' || order.status === 'DELIVERED' || order.status === 'REJECTED' || order.status === 'CANCELLED' || order.status === 'REFUNDING';
      }
      return order.status === activeSection;
    });
  }, [activeSection, orders]);

  return (
    <div className="space-y-5">
      <NotificationBanner />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto Print KOT Toggle */}
          <button
            onClick={handleToggleAutoPrint}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm active:scale-95 border ${
              autoPrintEnabled
                ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 shadow-emerald-500/10'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className={`h-2 w-2 rounded-full ${autoPrintEnabled ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
            <span>AUTO-PRINT KOT: {autoPrintEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
            {['today', '7d', '30d'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  range === r ? 'bg-brand-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {r === 'today' ? 'Today' : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingStats ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatCard label={`${range === 'today' ? 'Today' : range.toUpperCase()} Orders`} value={stats.ordersTotal.toString()} icon={todays_orders_icon} />
            <StatCard label={`${range === 'today' ? 'Today' : range.toUpperCase()} Revenue`} value={`₹${stats.grossRevenue.toLocaleString()}`} icon={todays_revenue_icon} />
            <StatCard label="Avg Order Value" value={`₹${stats.averageOrderValue.toFixed(0)}`} icon={prep_time_icon} />
            <StatCard label="Live Orders" value={stats.ordersActive.toString()} icon={rejection_rate_icon} />
          </>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm col-span-4">{statsError ?? 'Unable to load metrics.'}</div>
        )}
      </section>

      {newOrderModal ? (
        <NewOrderOverlay
          order={newOrderModal}
          onAccept={handleConfirm}
          onReject={handleReject}
          onClose={() => {
            setNewOrderModal(null);
            setNewOrder(null);
          }}
        />
      ) : null}

      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          {orderSections.map(section => {
            const Icon = section.Icon;
            const isSelected = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  isSelected
                    ? 'bg-[#E7F7F0] text-[#1D915F] shadow-sm'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon className={`h-5 w-5 transition-colors ${isSelected ? 'text-[#1D915F]' : 'text-slate-400'}`} />
                {section.label}
                <span className={`ml-1 flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${
                  isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {sectionCounts[section.key]}
                </span>
              </button>
            );
          })}
        </div>

        {loadingOrders ? (
          <div className="grid gap-6">
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </div>
        ) : ordersError ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">{ordersError}</div>
        ) : (
          <div>
            {filteredOrders.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-16 text-center shadow-sm">
                <p className="text-base font-medium text-slate-400">No orders in {activeSection.toLowerCase()} stage</p>
              </div>
            ) : activeSection === 'HISTORY' ? (
              <HistoryTable orders={filteredOrders} />
            ) : (
              <div className="grid gap-6">
                {filteredOrders.map(order => (
                  <OrderCard 
                    key={order.id} 
                    order={order} 
                    onUpdate={handleOrderUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      {/* Hidden KOT auto-printer target */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {autoKot.data && <KitchenTicket ref={autoKot.ref} ticket={autoKot.data} />}
      </div>
    </div>
  );
};

export default DashboardPage;
