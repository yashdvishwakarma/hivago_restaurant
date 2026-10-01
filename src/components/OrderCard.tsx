import React, { useEffect, useState } from 'react';
import { Order } from '../types';
import { formatCurrency, formatRelativeTime } from '../utils/format';
import { customerPickupOrder, fetchDeliveryCodes, fetchOrderById, preparingOrder, readyOrder, rejectOrder } from '../api/dashboardApi';
import pickup_icon from '../assets/pickup_icon.svg';
import order_preparing_man from '../assets/order_preparing_man.svg';
import ready_to_pickup from '../assets/ready_to_pickup.svg';
import { useToast } from '../context/ToastContext';
import TimelineModal from './TimelineModal';
import { useAuth } from '../context/AuthContext';
import { useKotPrint, useLabelPrint } from '../hooks/usePrintDoc';
import { KitchenTicket } from './orders/KitchenTicket';
import { OrderLabel } from './orders/OrderLabel';

import { getCachedOrderDetail, saveOrderDetailToCache } from '../utils/orderCache';
import { getOrderSupportUrl } from '../utils/whatsapp';

interface OrderCardProps {
  order: Order;
  onUpdate?: (updatedOrder: Order) => void;
}

const OrderCard = ({ order: initialOrder, onUpdate }: OrderCardProps) => {
  const [order, setOrder] = useState<Order>(() => {
    const cachedDetail = getCachedOrderDetail(initialOrder.id);
    return cachedDetail ? { ...initialOrder, ...cachedDetail } as Order : initialOrder;
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();
  const kot = useKotPrint();
  const label = useLabelPrint();
  
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedPrepTime, setSelectedPrepTime] = useState(25);
  const [deliveryPartner, setDeliveryPartner] = useState<'HIVAGO' | 'RESTAURANT'>('HIVAGO');
  const [deliveryCodes, setDeliveryCodes] = useState<{ pickupCode: string | null, dropCode: string | null } | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const fetchedIdsRef = React.useRef<Set<string>>(new Set());

  const calculateTimeLeft = () => {
    const createdAt = new Date(order.createdAt).getTime();
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    const diff = Math.max(0, Math.floor((createdAt + tenMinutes - now) / 1000));
    return diff;
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    if (order.status !== 'PENDING') return;

    // Initial sync
    const initialRemaining = calculateTimeLeft();
    setTimeLeft(initialRemaining);

    if (initialRemaining <= 0 && !actionLoading) {
      handleAutoReject();
      return;
    }

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      
      // Auto-reject if time is up and still pending
      if (remaining <= 0 && order.status === 'PENDING' && !actionLoading) {
        clearInterval(timer);
        handleAutoReject();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [order.status, order.createdAt, actionLoading]);

  const handleAutoReject = async () => {
    try {
      const updatedOrder = await rejectOrder(order.id, 'No response from restaurant');
      setOrder(updatedOrder);
      showToast(`Order #${order.orderNumber} auto-rejected due to inactivity`, 'info');
      if (onUpdate) onUpdate(updatedOrder);
    } catch (err) {
      console.error('Auto-rejection failed:', err);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Hydrate from cache immediately if present
    const cached = getCachedOrderDetail(initialOrder.id);
    const mergedInitial = cached ? { ...initialOrder, ...cached } : initialOrder;

    // Sync local state with prop when it changes (especially status)
    setOrder(prev => ({
      ...prev,
      ...mergedInitial,
      customerPhone: mergedInitial.customerPhone || prev.customerPhone,
      address: mergedInitial.address || prev.address,
      customerName: mergedInitial.customerName || prev.customerName,
      customerNote: mergedInitial.customerNote || prev.customerNote,
      paymentStatus: mergedInitial.paymentStatus || prev.paymentStatus,
      paymentStatusDisplay: mergedInitial.paymentStatusDisplay || prev.paymentStatusDisplay,
      riderName: mergedInitial.riderName || prev.riderName,
      riderPhone: mergedInitial.riderPhone || prev.riderPhone,
      otp: mergedInitial.otp || prev.otp,
      items: (mergedInitial.items && mergedInitial.items.length > 0) ? mergedInitial.items : prev.items
    }));

    const loadFullDetails = async () => {
      const currentItems = mergedInitial.items || order.items;
      // If items are missing AND we haven't fetched them for this ID yet
      const needsFetch = (!currentItems || currentItems.length === 0) && !fetchedIdsRef.current.has(initialOrder.id);
      
      if (needsFetch) {
        // Add a small random delay to spread out requests when many cards mount at once
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1500));
        
        if (fetchedIdsRef.current.has(initialOrder.id)) return;

        setLoading(true);
        try {
          const fullOrder = await fetchOrderById(initialOrder.id);
          setOrder(fullOrder);
          saveOrderDetailToCache(initialOrder.id, fullOrder);
          fetchedIdsRef.current.add(initialOrder.id);
        } catch (err: any) {
          console.error(`Failed to fetch details for order ${initialOrder.id}`, err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadFullDetails();
  }, [
    initialOrder.id,
    initialOrder.status,
    initialOrder.paymentStatus,
    initialOrder.paymentStatusDisplay,
    initialOrder.riderName,
    initialOrder.riderPhone,
    initialOrder.otp,
    initialOrder.address,
    initialOrder.customerName,
    initialOrder.customerPhone,
    initialOrder.customerNote,
    JSON.stringify(initialOrder.items),
    showToast
  ]);

  useEffect(() => {
    const loadCodes = async () => {
      if (order.status === 'PREPARING' || order.status === 'READY') {
        try {
          const codes = await fetchDeliveryCodes(order.id);
          setDeliveryCodes(codes);
        } catch (err) {
          console.error('Failed to fetch delivery codes:', err);
        }
      } else {
        setDeliveryCodes(null);
      }
    };

    loadCodes();
  }, [order.id, order.status]);

  const handleReady = async () => {
    const originalOrder = { ...order };
    const optimisticOrder = { ...order, status: 'READY' as const };
    
    // Optimistic update
    setOrder(optimisticOrder);
    if (onUpdate) onUpdate(optimisticOrder);
    setActionLoading(true);

    try {
      const updatedOrder = await readyOrder(order.id);
      setOrder(updatedOrder);
      if (onUpdate) onUpdate(updatedOrder);
    } catch (err: any) {
      // Rollback
      setOrder(originalOrder);
      if (onUpdate) onUpdate(originalOrder);
      console.error('Failed to mark order as ready:', err);
      showToast(err.response?.data?.message || err.message || 'Failed to update order status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCustomerPickup = async () => {
    const originalOrder = { ...order };
    const optimisticOrder = { ...order, status: 'DELIVERED' as const };
    
    // Optimistic update
    setOrder(optimisticOrder);
    if (onUpdate) onUpdate(optimisticOrder);
    setActionLoading(true);

    try {
      const updatedOrder = await customerPickupOrder(order.id);
      setOrder(updatedOrder);
      if (onUpdate) onUpdate(updatedOrder);
      showToast(`Order #${order.orderNumber} marked as picked up by customer`, 'success');
    } catch (err: any) {
      // Rollback
      setOrder(originalOrder);
      if (onUpdate) onUpdate(originalOrder);
      console.error('Failed to mark order as customer picked up:', err);
      showToast(err.response?.data?.message || err.message || 'Failed to update order status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    const originalOrder = { ...order };
    const optimisticOrder = { ...order, status: 'PREPARING' as const };

    // Optimistic update
    setOrder(optimisticOrder);
    if (onUpdate) onUpdate(optimisticOrder);
    setActionLoading(true);

    try {
      const updatedOrder = await preparingOrder(order.id, selectedPrepTime, deliveryPartner);
      setOrder(updatedOrder);
      if (onUpdate) onUpdate(updatedOrder);

      const autoPrintEnabled = localStorage.getItem('hivago_auto_print_kot') === 'true';
      if (autoPrintEnabled) {
        kot.print(updatedOrder.id);
      }
    } catch (err: any) {
      // Rollback
      setOrder(originalOrder);
      if (onUpdate) onUpdate(originalOrder);
      console.error('Failed to accept order:', err);
      showToast(err.response?.data?.message || err.message || 'Failed to accept order', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectClick = () => {
    setShowRejectReason(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason) return;
    const originalOrder = { ...order };
    const optimisticOrder = { ...order, status: 'REJECTED' as const };

    // Optimistic update
    setOrder(optimisticOrder);
    if (onUpdate) onUpdate(optimisticOrder);
    setActionLoading(true);

    try {
      const updatedOrder = await rejectOrder(order.id, rejectReason);
      setOrder(updatedOrder);
      setShowRejectReason(false);
      setRejectReason('');
      if (onUpdate) onUpdate(updatedOrder);
    } catch (err: any) {
      // Rollback
      setOrder(originalOrder);
      if (onUpdate) onUpdate(originalOrder);
      console.error('Failed to reject order:', err);
      showToast(err.response?.data?.message || err.message || 'Failed to reject order', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="grid lg:grid-cols-[1.5fr_1fr]">
        
        {/* Left Column: Order Details */}
        <div className="p-5 md:p-6 lg:p-7 flex flex-col justify-between">
          <div>
            <header className="flex flex-wrap items-center justify-between gap-2.5 font-inter">
              <div className="flex flex-wrap items-center gap-2">
                {order.restaurantName && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                    <svg className="h-3.5 w-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5" />
                    </svg>
                    {order.restaurantName}
                  </div>
                )}
                {loading ? (
                  <div className="h-7 w-20 animate-pulse rounded-lg bg-slate-100"></div>
                ) : order.pickupType === 'DELIVERY' ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#AD221F] text-[10px] text-white font-black">H</span>
                    Hivago Delivery
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white font-black">P</span>
                    Self Pickup
                  </div>
                )}

                {!loading && order.customerNote?.toLowerCase().includes('cutlery') && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                    <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Cutlery
                  </div>
                )}

                {loading ? (
                  <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-100"></div>
                ) : order.paymentStatus?.toUpperCase() === 'PAID' ? (
                  <span className="flex items-center gap-1 rounded-lg bg-[#DCFCE7] px-3 py-1.5 text-xs font-bold text-[#15803D]">
                    PAID
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-lg bg-[#FEF9C3] px-3 py-1.5 text-xs font-bold text-[#854D0E]">
                    {order.paymentStatusDisplay?.toUpperCase() || order.paymentStatus?.toUpperCase() || 'UNPAID'}
                  </span>
                )}
              </div>

              {order.status !== 'PENDING' && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => kot.print(order.id)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#AD221F] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-800 transition-all active:scale-95"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h8z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    KOT
                  </button>
                  <button 
                    onClick={() => label.print(order.id)}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-900 transition-all active:scale-95"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    BILL
                  </button>
                </div>
              )}
            </header>

            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">#{order.orderNumber}</h3>
                <span className="text-xs font-bold text-slate-400">{formatRelativeTime(order.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-xs font-semibold text-slate-500 line-clamp-1">
                {order.address}
              </p>
            </div>

            {order.customerNote && (
              <div className="mt-3 rounded-xl bg-[#FFF9E5] border border-[#FDE68A]/50 px-3.5 py-2 text-xs font-bold text-[#856404]">
                <span className="mr-1 text-[#D97706]">●</span> Customer Note: <span className="font-medium">{order.customerNote}</span>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Order Items</p>
              {loading ? (
                <div className="flex animate-pulse flex-col gap-2">
                  <div className="h-4 w-3/4 rounded bg-slate-50"></div>
                  <div className="h-4 w-1/2 rounded bg-slate-50"></div>
                </div>
              ) : order.items && order.items.length > 0 ? (
                <div className="divide-y divide-slate-50 border-t border-b border-slate-50 py-1">
                  {order.items.map(item => (
                    <div key={item.id} className="py-2 flex items-center justify-between text-xs sm:text-sm font-semibold">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-slate-900 min-w-[20px]">{item.quantity}x</span>
                        <span className="text-slate-800">{item.name}</span>
                        {item.specialInstructions && (
                          <span className="rounded-md bg-[#FFF9E5] border border-[#FDE68A] px-2 py-0.5 text-[11px] font-medium text-[#856404]">
                            Note: {item.specialInstructions}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-400 italic">No items available</p>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between text-xs font-semibold text-slate-600 gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{order.customerPhone || 'Customer'}</span>
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`} className="font-bold text-blue-600 hover:underline">
                  Call
                </a>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowTimeline(true)}
                className="font-bold text-blue-600 hover:underline text-xs"
              >
                Timeline
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Status & Actions */}
        <div className="flex flex-col justify-between border-l border-slate-50 bg-[#FBFBFC] p-5 md:p-6 lg:p-7">
          <div className="space-y-4">
             {order.status === 'PICKED_UP' ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-[#E0F2FE] p-3 border border-blue-100">
                        <img src={ready_to_pickup} className="h-10 w-auto object-contain shrink-0" alt="Picked Up" />
                        <div>
                           <h4 className="text-base font-bold text-[#3B82F6]">Picked Up</h4>
                           <p className="text-xs font-semibold text-[#3B82F6]/70">
                             {order.riderName?.split(' ')[0] || 'Rider'} has picked up your order.
                           </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF4D4D] text-xs font-bold text-white shadow-sm shrink-0">
                                {order.riderName?.split(' ').map(n => n[0]).join('') || 'RD'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{order.riderName || 'Rider Assigned'}</p>
                                <p className="text-[11px] font-semibold text-slate-400">Rider on the way</p>
                            </div>
                            {order.riderPhone && (
                              <a href={`tel:${order.riderPhone}`} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline">
                                  Call
                              </a>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-600">Total Bill</span>
                        <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total)}</span>
                    </div>
                </div>
              ) : order.status === 'READY' ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-[#F5F3FF] p-3 border border-violet-100">
                        <img src={ready_to_pickup} className="h-10 w-auto object-contain shrink-0" alt="Ready" />
                        <div>
                           <h4 className="text-base font-bold text-[#6366F1]">Ready to Pickup</h4>
                           <p className="text-xs font-semibold text-[#6366F1]/70">
                             {order.riderName ? `${order.riderName} is on the way.` : 'A rider will be assigned soon.'}
                           </p>
                        </div>
                    </div>

                    {order.pickupType === 'DELIVERY' ? (
                      <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm space-y-3">
                          <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF4D4D] text-xs font-bold text-white shadow-sm shrink-0">
                                  {order.riderName?.split(' ').map(n => n[0]).join('') || 'RD'}
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate">{order.riderName || 'Rider Assignment Pending'}</p>
                                  {order.riderName && <p className="text-[11px] font-semibold text-emerald-600">is on the way</p>}
                              </div>
                          </div>

                          {deliveryCodes?.pickupCode && (
                            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-2.5 text-center">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-0.5">Verification Code</p>
                              <p className="text-2xl font-bold tracking-[0.15em] text-violet-700">
                                {deliveryCodes.pickupCode}
                              </p>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-100 bg-emerald-50/30 p-3.5 text-center space-y-3">
                          <div>
                              <p className="text-xs font-bold text-emerald-600">Waiting for customer pickup</p>
                          </div>
                          <button
                            onClick={handleCustomerPickup}
                            disabled={actionLoading}
                            className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-600 active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1.5"
                          >
                            {actionLoading ? 'Updating...' : 'Mark as Collected'}
                          </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-600">Total Bill</span>
                        <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total)}</span>
                    </div>
                </div>
              ) : order.status === 'PENDING' ? (
                <div className="space-y-4">
                  {showRejectReason ? (
                    <div className="space-y-3 rounded-2xl border border-red-100 bg-red-50/30 p-4">
                      <div>
                        <h4 className="text-xs font-bold text-red-600">Reason for rejection:</h4>
                      </div>
                      <select
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        className="w-full rounded-xl border border-red-100 bg-white p-2.5 text-xs font-semibold text-slate-700 outline-none"
                      >
                        <option value="">Select reason...</option>
                        <option value="Items out of stock">Items out of stock</option>
                        <option value="Kitchen is too busy">Kitchen is too busy</option>
                        <option value="Closing soon">Closing soon</option>
                        <option value="Delivery area too far">Delivery area too far</option>
                        <option value="Other">Other</option>
                      </select>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setShowRejectReason(false);
                            setRejectReason('');
                          }}
                          disabled={actionLoading}
                          className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleConfirmReject}
                          disabled={!rejectReason || actionLoading}
                          className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
                        >
                          {actionLoading ? 'Rejecting...' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-3 border border-amber-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">⏳</span>
                              <div>
                                <h4 className="text-sm font-bold text-amber-700">Pending Order</h4>
                                <p className="text-[11px] font-semibold text-amber-600/70">Awaiting your response</p>
                              </div>
                            </div>
                            <div className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
                              timeLeft < 120 ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {formatTimer(timeLeft)}
                            </div>
                        </div>

                        {/* Prep Time Selection */}
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-2">Preparation Time:</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[15, 20, 25, 30, 35, 40, 45, 60].map((time) => (
                              <button
                                key={time}
                                onClick={() => setSelectedPrepTime(time)}
                                className={`rounded-lg py-1.5 text-xs font-bold transition-all ${
                                  selectedPrepTime === time
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {time}m
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Delivery Partner Selection */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-bold text-slate-500">Delivery Partner:</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDeliveryPartner('HIVAGO')}
                              className={`flex-1 rounded-xl border-2 py-2 text-xs font-bold transition-all ${
                                deliveryPartner === 'HIVAGO'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                              }`}
                            >
                              Hivago
                            </button>
                            <button
                              onClick={() => setDeliveryPartner('RESTAURANT')}
                              className={`flex-1 rounded-xl border-2 py-2 text-xs font-bold transition-all ${
                                deliveryPartner === 'RESTAURANT'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                              }`}
                            >
                              Self Delivery
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-600">Total Bill</span>
                            <span className="text-xl font-bold text-slate-900">{formatCurrency(order.total)}</span>
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button 
                              onClick={handleRejectClick}
                              disabled={actionLoading}
                              className={`flex-1 rounded-xl border py-2.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                                timeLeft < 120 
                                  ? 'border-red-500 bg-red-50 text-red-600' 
                                  : 'border-red-200 bg-white text-red-500 hover:bg-red-50'
                              }`}
                            >
                              Reject ({formatTimer(timeLeft)})
                            </button>
                            <button 
                              onClick={handleAccept}
                              disabled={actionLoading}
                              className="flex-[1.4] rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {actionLoading ? (
                                <>
                                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>Accepting...</span>
                                </>
                              ) : (
                                <span>Accept Order</span>
                              )}
                            </button>
                        </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-[#EEF2FF] p-3 border border-[#DEE5FF]">
                        <img src={order_preparing_man} className="h-10 w-auto object-contain shrink-0" alt="Preparing" />
                        <div>
                           <h4 className="text-base font-bold text-[#4338CA]">Preparing</h4>
                           <p className="text-xs font-semibold text-[#4338CA]/70">The food is being prepared</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-slate-600">Total Bill</span>
                        <span className="text-xl font-bold text-slate-900">{formatCurrency(order.total)}</span>
                    </div>

                    {deliveryCodes?.pickupCode && (
                      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-0.5">Rider Verification Code</p>
                        <p className="text-2xl font-bold tracking-[0.15em] text-violet-700">
                          {deliveryCodes.pickupCode}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      <button 
                        onClick={handleReady}
                        disabled={actionLoading}
                        className="w-full rounded-xl bg-[#AD221F] py-3 text-xs font-bold text-white shadow-md hover:bg-red-800 transition-all active:scale-95 disabled:opacity-70"
                      >
                        {actionLoading ? 'Updating...' : 'Mark Order Ready'}
                      </button>
                    </div>
                </div>
              )}
          </div>

          <div className="mt-4 flex gap-2 pt-3 border-t border-slate-100/80">
             <a 
               href={getOrderSupportUrl({ order, restaurantName: user?.name, type: 'help' })}
               target="_blank"
               rel="noopener noreferrer"
               className="flex-1 text-center rounded-xl border border-slate-100 bg-white py-2 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-50 hover:text-emerald-600 transition-colors"
             >
                Live Chat Support
             </a>
             <a 
               href={getOrderSupportUrl({ order, restaurantName: user?.name, type: 'issue' })}
               target="_blank"
               rel="noopener noreferrer"
               className="flex-1 text-center rounded-xl border border-slate-100 bg-white py-2 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-50 hover:text-emerald-600 transition-colors"
             >
                Order Help
             </a>
          </div>
        </div>
      </div>

      <TimelineModal 
        isOpen={showTimeline} 
        onClose={() => setShowTimeline(false)} 
        order={order} 
      />

      {/* Hidden print targets */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {kot.data && <KitchenTicket ref={kot.ref} ticket={kot.data} />}
        {label.data && <OrderLabel ref={label.ref} label={label.data} />}
      </div>
    </article>
  );
};

export default OrderCard;
