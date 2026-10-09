import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { NewRestaurantStats } from '../types';
import { fetchRestaurantStats } from '../api/dashboardApi';

export const useDashboardStats = (range: string = 'today') => {
  const { user, loading: authLoading } = useAuth();
  const { lastOrderReceived, lastStatusUpdate } = useNotifications();
  const [stats, setStats] = useState<NewRestaurantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetchRestaurantStats(range);
      setStats(response);
    } catch (err) {
      console.warn('Failed to fetch dashboard stats:', err);
      setError('Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, range]);

  // Initial load & 15-second background polling
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user?.id) {
      setStats(null);
      setLoading(false);
      setError('Restaurant not authenticated.');
      return;
    }

    refreshStats(false);

    const timer = setInterval(() => {
      refreshStats(true);
    }, 15000);

    return () => clearInterval(timer);
  }, [user?.id, range, authLoading, refreshStats]);

  // Auto-refresh stats when SignalR events arrive
  useEffect(() => {
    if (lastOrderReceived || lastStatusUpdate) {
      refreshStats(true);
    }
  }, [lastOrderReceived, lastStatusUpdate, refreshStats]);

  // Cross-tab Synchronization using BroadcastChannel & localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('hivago_order_updates_channel');
      channel.onmessage = (event) => {
        if (event.data?.type === 'ORDER_UPDATED') {
          refreshStats(true);
        }
      };
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hivago_last_order_update_broadcast' && e.newValue) {
        refreshStats(true);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshStats]);

  return { stats, loading: (loading && !stats) || authLoading, error, refreshStats };
};
