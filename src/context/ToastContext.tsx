import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    setToasts((prev) => {
      const now = Date.now();
      // Extract order number if present (e.g. #ORD-20261009-00380) for smart deduplication
      const orderMatch = message.match(/#[\w-]+/);
      const orderNum = orderMatch ? orderMatch[0] : null;

      const isDuplicate = prev.some(t => {
        const timeDiff = now - Number(t.id.split('-')[0]);
        if (timeDiff >= 3000) return false;
        if (t.message === message) return true;
        if (orderNum && t.message.includes(orderNum)) return true;
        return false;
      });

      if (isDuplicate) return prev;

      const id = `${now}-${Math.random().toString(36).substring(2, 9)}`;
      const nextToasts = [...prev, { id, message, type, duration }];
      // Keep only max 2 visible toasts at a time to prevent UI clutter
      return nextToasts.slice(-2);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 pointer-events-none sm:max-w-md w-full px-4 sm:px-0">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem 
              key={toast.id} 
              toast={toast} 
              removeToast={removeToast} 
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};


const ToastItem = ({ toast, removeToast }: { toast: ToastMessage; removeToast: (id: string) => void }) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, removeToast]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      case 'warning':
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 17c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, x: 20, scale: 0.9, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)', transition: { duration: 0.2 } }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 30,
        layout: { duration: 0.3 }
      }}
      className="pointer-events-auto w-full"
    >

      <div className="group relative overflow-hidden rounded-[28px] bg-white/95 backdrop-blur-xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-slate-100/50 flex items-center gap-4 transition-transform hover:scale-[1.02] active:scale-[0.98]">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 leading-snug tracking-tight">
            {toast.message}
          </p>
        </div>
        <button 
          onClick={() => removeToast(toast.id)}
          className="shrink-0 p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Progress bar at bottom */}
        <div className="absolute bottom-0 left-0 h-1 bg-slate-100 w-full" />
        <motion.div 
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: (toast.duration || 4000) / 1000, ease: 'linear' }}
          className={`absolute bottom-0 left-0 h-1 ${
            toast.type === 'success' ? 'bg-emerald-500' : 
            toast.type === 'error' ? 'bg-rose-500' : 
            toast.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
          }`}
        />
      </div>
    </motion.div>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
