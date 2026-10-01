import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Order } from '../types';
import { fetchOrders, normalizeOrder } from '../api/dashboardApi';
import { getCachedOrders, saveOrdersToCache, updateOrderInCache } from '../utils/orderCache';

export const useOrders = () => {
  const { user, loading: authLoading } = useAuth();
  const { lastOrderReceived, clearLastOrderReceived, stopNotification, playNotification, showBrowserNotification } = useNotifications();
  const [orders, setOrders] = useState<Order[]>([]);
  const [newOrder, setNewOrderState] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setNewOrder = (order: Order | null) => {
    setNewOrderState(order);
    if (!order) {
      stopNotification();
    }
  };
  const previousOrderIdsRef = useRef<string[]>([]);
  const initialLoadRef = useRef(false);

  const refreshOrders = async (silent = false) => {
    if (!user?.id) {
      if (!authLoading) {
        setOrders([]);
        setNewOrder(null);
        setLoading(false);
      }
      return;
    }

    // Only set loading true if we have no cached orders to show
    if (!silent && orders.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const outletsToFetch = Array.from(new Set([user.id, ...(user.restaurantIds || [])]));
      const orderResponses = await Promise.all(
        outletsToFetch.map(outletId => 
          fetchOrders(outletId, { activeOnly: false, pageSize: 100 }).catch(err => {
            console.warn(`Failed to fetch orders for outlet ${outletId}:`, err);
            return [] as Order[];
          })
        )
      );

      const combinedOrders = orderResponses.flat();
      const uniqueOrdersMap = new Map<string, Order>();
      combinedOrders.forEach(order => uniqueOrdersMap.set(order.id, order));
      const allOrders = Array.from(uniqueOrdersMap.values());
      
      // Filter out orders with pending payment status
      const latestOrders = allOrders.filter(order => 
        order.paymentStatus?.toUpperCase() !== 'PENDING'
      );

      // Sort by createdAt descending
      latestOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (initialLoadRef.current) {
        const previousIds = new Set(previousOrderIdsRef.current);
        const newlyArrived = latestOrders.find(order => !previousIds.has(order.id));
        if (newlyArrived && newlyArrived.status === 'PENDING') {
          setNewOrder(newlyArrived);
          playNotification();
          showBrowserNotification(newlyArrived);
        }
      }

      previousOrderIdsRef.current = latestOrders.map(order => order.id);
      setOrders(latestOrders);
      saveOrdersToCache(user.id, latestOrders);
      initialLoadRef.current = true;
    } catch (err) {
      // If we already have cached orders displaying, don't override with error banner unless empty
      if (orders.length === 0) {
        setError('Unable to load orders.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      setError('Restaurant not authenticated.');
      return;
    }

    // Attempt to hydrate instantly from cache for zero latency
    const cached = getCachedOrders(user.id);
    if (cached && cached.length > 0) {
      setOrders(cached);
      previousOrderIdsRef.current = cached.map(o => o.id);
      initialLoadRef.current = true;
      setLoading(false);
      // Fetch fresh data in background without showing full skeleton
      refreshOrders(true);
    } else {
      refreshOrders(false);
    }

    const timer = setInterval(() => {
      refreshOrders(true);
    }, 15000);

    return () => clearInterval(timer);
  }, [user?.id, user?.restaurantIds, authLoading]);

  // Handle Real-Time Updates from SignalR
  useEffect(() => {
    if (lastOrderReceived) {
      console.log('Real-time order update received:', lastOrderReceived);
      
      // Normalize the SignalR payload using the robust dashboardApi normalizer
      const normalizedOrder = normalizeOrder(lastOrderReceived);
      
      // Force status to PENDING since it is received via NewOrderReceived event
      normalizedOrder.status = 'PENDING';
      
      // Prepend to local orders list immediately
      updateLocalOrder(normalizedOrder);

      // Instantly open the popup when the event triggers (ensuring it matches the sound play)
      setNewOrder(normalizedOrder);
      
      // Clear it from the notification context so we don't process it again on remount
      clearLastOrderReceived();
      
      // Debounce the refresh to avoid hammering the server if many updates arrive
      const timer = setTimeout(() => {
        refreshOrders(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [lastOrderReceived]);

  const updateLocalOrder = (updatedOrder: Order) => {
    setOrders(prev => {
      const exists = prev.some(o => o.id === updatedOrder.id);
      const next = exists
        ? prev.map(o => o.id === updatedOrder.id ? updatedOrder : o)
        : [updatedOrder, ...prev];
      const remainingPending = next.filter(o => o.status === 'PENDING');
      if (remainingPending.length === 0) {
        stopNotification();
      }
      return next;
    });

    if (user?.id) {
      updateOrderInCache(user.id, updatedOrder);
    }
  };

  return { orders, newOrder, setNewOrder, refreshOrders, updateLocalOrder, loading, error };
};
