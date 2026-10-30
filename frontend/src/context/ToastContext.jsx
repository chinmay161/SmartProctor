import React, { createContext, useContext, useState, useCallback } from 'react';
import Icon from '../components/AppIcon';

export const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newToast = { id, message, type };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
    dismiss: removeToast,
  };

  const getToastIcon = (type) => {
    switch (type) {
      case 'success':
        return <Icon name="CheckCircle" size={18} className="text-emerald-500 shrink-0" />;
      case 'error':
        return <Icon name="AlertCircle" size={18} className="text-red-500 shrink-0" />;
      case 'warning':
        return <Icon name="AlertTriangle" size={18} className="text-amber-500 shrink-0" />;
      case 'info':
      default:
        return <Icon name="Info" size={18} className="text-blue-500 shrink-0" />;
    }
  };

  const getToastClasses = (type) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/30 bg-card text-foreground shadow-emerald-500/10';
      case 'error':
        return 'border-red-500/30 bg-card text-foreground shadow-red-500/10';
      case 'warning':
        return 'border-amber-500/30 bg-card text-foreground shadow-amber-500/10';
      case 'info':
      default:
        return 'border-blue-500/30 bg-card text-foreground shadow-blue-500/10';
    }
  };

  return (
    <ToastContext.Provider value={{ toast, addToast, removeToast }}>
      {children}
      {/* Toast floating container */}
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-2 fade-in ${getToastClasses(
              t.type
            )}`}
          >
            {getToastIcon(t.type)}
            <div className="flex-1 text-sm font-medium leading-snug break-words">
              {t.message}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-muted-foreground hover:text-foreground transition p-0.5 rounded cursor-pointer"
              aria-label="Dismiss notification"
            >
              <Icon name="X" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
