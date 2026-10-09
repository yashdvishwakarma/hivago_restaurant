import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { signalRService } from '../api/signalrService';
import { fetchRestaurantSettings } from '../api/dashboardApi';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

interface NotificationContextType {
  lastOrderReceived: any | null;
  clearLastOrderReceived: () => void;
  lastStatusUpdate: any | null;
  clearLastStatusUpdate: () => void;
  isConnected: boolean;
  permissionStatus: NotificationPermissionStatus;
  playNotification: () => void;
  stopNotification: () => void;
  showBrowserNotification: (data: any) => void;
  requestBrowserPermission: () => Promise<NotificationPermission | undefined>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const PRIMARY_NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/1356/1356-preview.mp3';
const FALLBACK_NOTIFICATION_SOUND_URL = '/sounds/order_notification.mp3';

const notificationAudio = typeof window !== 'undefined' ? new Audio(PRIMARY_NOTIFICATION_SOUND_URL) : null;
let isAudioUnlocked = false;
let fallbackAudioInstance: HTMLAudioElement | null = null;
let webAudioIntervalRef: any = null;
let audioCtxInstance: AudioContext | null = null;

const playWebAudioChime = () => {
  try {
    const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioCtx) return;
    if (!audioCtxInstance) {
      audioCtxInstance = new AudioCtx();
    }
    if (audioCtxInstance.state === 'suspended') {
      audioCtxInstance.resume();
    }

    stopWebAudioChime();

    const triggerChimeBeep = () => {
      if (!audioCtxInstance) return;
      const now = audioCtxInstance.currentTime;

      // Tone 1: High crisp alert chime
      const osc1 = audioCtxInstance.createOscillator();
      const gain1 = audioCtxInstance.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(audioCtxInstance.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Tone 2: Secondary harmony tone
      const osc2 = audioCtxInstance.createOscillator();
      const gain2 = audioCtxInstance.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.15);
      gain2.gain.setValueAtTime(0.3, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(audioCtxInstance.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.45);
    };

    triggerChimeBeep();
    webAudioIntervalRef = setInterval(triggerChimeBeep, 800);
  } catch (err) {
    console.error('[Notification] Web Audio chime fallback error:', err);
  }
};

const stopWebAudioChime = () => {
  if (webAudioIntervalRef) {
    clearInterval(webAudioIntervalRef);
    webAudioIntervalRef = null;
  }
};

const unlockAudio = () => {
  if (isAudioUnlocked) return;

  if (notificationAudio) {
    notificationAudio.volume = 0;
    notificationAudio.play()
      .then(() => {
        notificationAudio.pause();
        notificationAudio.volume = 1;
        isAudioUnlocked = true;
        cleanupListeners();
      })
      .catch(err => {
        console.warn('[Notification] Failed to unlock audio (will retry on next user interaction):', err);
      });
  }

  try {
    const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (AudioCtx) {
      if (!audioCtxInstance) {
        audioCtxInstance = new AudioCtx();
      }
      if (audioCtxInstance.state === 'suspended') {
        audioCtxInstance.resume();
      }
    }
  } catch (e) {
    console.warn('[Notification] Failed to resume AudioContext:', e);
  }
};

const cleanupListeners = () => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('scroll', unlockAudio);
  }
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();
  const [lastOrderReceived, setLastOrderReceived] = useState<any | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission as NotificationPermissionStatus;
    }
    return 'unsupported';
  });

  const titleIntervalRef = useRef<any>(null);
  const originalTitleRef = useRef<string>('');

  // Register Service Worker for robust background/OS desktop notifications
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        // Service worker registered
      }).catch((err) => {
        console.warn('[Notification] Service Worker registration failed:', err);
      });
    }
  }, []);

  // Set up global user interaction listeners to unlock Audio Context & check Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (notificationAudio && !isAudioUnlocked) {
        window.addEventListener('click', unlockAudio);
        window.addEventListener('touchstart', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
        window.addEventListener('scroll', unlockAudio);
      }

      if ('Notification' in window) {
        setPermissionStatus(Notification.permission as NotificationPermissionStatus);
      }
    }

    return () => {
      cleanupListeners();
    };
  }, []);

  // Sync window focus & tab visibility for SignalR reconnection
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (isAuthenticated && user?.id && !signalRService.isConnected()) {
          signalRService.start().then(() => setIsConnected(true)).catch(err => {
            console.error('[Notification] Reconnect error:', err);
          });
        }
      }
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
      window.addEventListener('focus', handleVisibilityOrFocus);
    }
    return () => {
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
        window.removeEventListener('focus', handleVisibilityOrFocus);
      }
    };
  }, [isAuthenticated, user?.id]);

  // Fetch settings to check if orderSound & browserNotifications are enabled
  useEffect(() => {
    if (isAuthenticated && user?.id && user?.role === 'restaurant') {
      fetchRestaurantSettings()
        .then(settings => {
          if (settings && settings.notifications) {
            setSoundEnabled(settings.notifications.orderSound !== false);
            setBrowserNotificationsEnabled(settings.notifications.browserNotifications !== false);
          }
        })
        .catch(err => {
          console.warn('[Notification] Failed to fetch settings in NotificationContext:', err);
        });
    }
  }, [isAuthenticated, user]);

  const requestBrowserPermission = async (): Promise<NotificationPermission | undefined> => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setPermissionStatus(perm as NotificationPermissionStatus);
        return perm;
      } catch (err) {
        console.warn('[Notification] Error requesting browser notification permission:', err);
      }
    }
    return undefined;
  };

  const startTitleBlinking = (orderNumStr: string) => {
    if (typeof document === 'undefined') return;
    if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);

    originalTitleRef.current = document.title || 'Hivago Restaurant';
    let toggle = false;

    titleIntervalRef.current = setInterval(() => {
      toggle = !toggle;
      document.title = toggle
        ? `🔔 NEW ORDER ${orderNumStr}!`
        : `🚨 ACTION REQUIRED - Hivago`;
    }, 1000);

    const stopTitleBlinking = () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
      window.removeEventListener('focus', stopTitleBlinking);
      window.removeEventListener('click', stopTitleBlinking);
    };

    window.addEventListener('focus', stopTitleBlinking);
    window.addEventListener('click', stopTitleBlinking);
  };

  const showBrowserNotification = async (data: any) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (!browserNotificationsEnabled) {
      return;
    }

    const orderNum = data.orderNumber || data.orderNo || data.orderCode || data.id || '';
    const formattedNum = String(orderNum).startsWith('#') ? orderNum : `#${orderNum}`;
    const amount = data.totalAmount || data.price || data.grossAmount || data.pricing?.finalTotal;
    const outletText = data.restaurantName ? ` for ${data.restaurantName}` : '';
    const bodyText = amount 
      ? `New order${outletText} received for ₹${amount}. Click to open dashboard.` 
      : `A new order${outletText} has arrived on your dashboard. Click to view details.`;

    if (document.hidden || !document.hasFocus()) {
      startTitleBlinking(formattedNum);
    }

    const triggerNativeNotification = async () => {
      try {
        const title = `🔔 New Order ${formattedNum}${outletText}`;
        const options: NotificationOptions & { vibrate?: number[] } = {
          body: bodyText,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: `new-order-${data.orderId || data.id || orderNum}`,
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          data: { url: window.location.origin }
        };

        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
              await reg.showNotification(title, options);
              return;
            }
          } catch (swErr) {
            console.warn('[Notification] SW showNotification failed, using fallback:', swErr);
          }
        }

        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (err) {
        console.error('[Notification] Error creating native browser notification:', err);
      }
    };

    if (Notification.permission === 'granted') {
      await triggerNativeNotification();
    } else if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        setPermissionStatus(permission as NotificationPermissionStatus);
        if (permission === 'granted') {
          await triggerNativeNotification();
        }
      } catch (e) {
        console.warn('[Notification] Automated requestPermission blocked by browser policies.', e);
      }
    }
  };

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      signalRService.start().then(() => {
        setIsConnected(true);
      }).catch(err => {
        console.error('[Notification] SignalR connection failed:', err);
      });

      const handleIncomingNotification = (data: any) => {
        setLastOrderReceived(data);
        const orderNum = data.orderNumber || data.orderNo || data.orderCode || data.id;
        const outletLabel = data.restaurantName ? ` for ${data.restaurantName}` : '';
        const toastMsg = orderNum 
          ? `New Order #${orderNum}${outletLabel} received!` 
          : (data.title || data.message || 'New notification received!');
        showToast(toastMsg, 'info');
        playNotification();
        showBrowserNotification(data);
      };

      const handleStatusUpdate = (data: any) => {
        setLastStatusUpdate(data);
        const orderNum = data.orderNumber || data.orderNo || data.orderCode || data.orderId || data.id;
        const status = data.status || data.orderStatus || 'updated';
        const outletLabel = data.restaurantName ? ` (${data.restaurantName})` : '';
        if (orderNum) {
          showToast(`Order #${orderNum}${outletLabel} status updated: ${status}`, 'info');
        }
      };

      const unsubscribeOrder = signalRService.onNewOrder(handleIncomingNotification);
      const unsubscribeStatus = signalRService.onOrderStatusUpdate(handleStatusUpdate);
      const unsubscribeNotif = signalRService.onNotification(handleIncomingNotification);

      return () => {
        unsubscribeOrder();
        unsubscribeStatus();
        unsubscribeNotif();
        signalRService.stop();
        setIsConnected(false);
      };
    } else {
      signalRService.stop();
      setIsConnected(false);
    }
  }, [isAuthenticated, user?.id, browserNotificationsEnabled, soundEnabled]);

  const playNotification = () => {
    if (!soundEnabled) {
      return;
    }

    stopNotification();

    function tryFallbackAudio() {
      try {
        if (fallbackAudioInstance) {
          fallbackAudioInstance.pause();
          fallbackAudioInstance = null;
        }
        fallbackAudioInstance = new Audio(FALLBACK_NOTIFICATION_SOUND_URL);
        fallbackAudioInstance.loop = true;
        fallbackAudioInstance.volume = 1;
        fallbackAudioInstance.play().catch(() => {
          playWebAudioChime();
        });
      } catch {
        playWebAudioChime();
      }
    }

    if (!notificationAudio) {
      tryFallbackAudio();
      return;
    }

    try {
      notificationAudio.currentTime = 0;
      notificationAudio.volume = 1;
      notificationAudio.loop = true;

      const playPromise = notificationAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          tryFallbackAudio();
        });
      }
    } catch {
      tryFallbackAudio();
    }
  };

  const stopNotification = () => {
    try {
      if (notificationAudio) {
        notificationAudio.loop = false;
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
      }
      if (fallbackAudioInstance) {
        fallbackAudioInstance.loop = false;
        fallbackAudioInstance.pause();
        fallbackAudioInstance.currentTime = 0;
        fallbackAudioInstance = null;
      }
      stopWebAudioChime();
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      if (originalTitleRef.current && typeof document !== 'undefined') {
        document.title = originalTitleRef.current;
      }
    } catch (err) {
      console.error('[Notification] Failed to stop notification sound:', err);
    }
  };

  const clearLastOrderReceived = () => {
    setLastOrderReceived(null);
  };

  const clearLastStatusUpdate = () => {
    setLastStatusUpdate(null);
  };

  return (
    <NotificationContext.Provider value={{
      lastOrderReceived,
      clearLastOrderReceived,
      lastStatusUpdate,
      clearLastStatusUpdate,
      isConnected,
      permissionStatus,
      playNotification,
      stopNotification,
      showBrowserNotification,
      requestBrowserPermission
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
