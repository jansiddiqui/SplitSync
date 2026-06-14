import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X, RotateCcw } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
  undoAction?: () => void;
  undoLabel?: string;
}

interface ToastContextValue {
  success: (message: string, opts?: Partial<Toast>) => void;
  error: (message: string, opts?: Partial<Toast>) => void;
  warning: (message: string, opts?: Partial<Toast>) => void;
  info: (message: string, opts?: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  warning: <AlertCircle className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
};

const COLORS: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: 'border-emerald-500/20',
  error: 'border-red-500/20',
  warning: 'border-amber-500/20',
  info: 'border-blue-500/20',
};

const ToastItem: React.FC<{
  toast: Toast;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = toast.duration ?? 4000;
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - (startRef.current ?? now);
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining * 100);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [duration, dismiss]);

  return (
    <div
      className={`
        relative flex items-start gap-3 p-4 rounded-xl border overflow-hidden
        ${BORDER_COLORS[toast.type]}
        ${exiting ? 'toast-exit' : 'toast-enter'}
      `}
      style={{
        background: 'rgba(10, 14, 22, 0.96)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
        minWidth: '280px',
        maxWidth: '360px',
      }}
      role="alert"
    >
      {/* Icon */}
      <span className={`shrink-0 mt-0.5 ${COLORS[toast.type]}`}>
        {ICONS[toast.type]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-100 leading-tight">{toast.message}</p>
        {toast.description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{toast.description}</p>
        )}
        {toast.undoAction && (
          <button
            onClick={() => { toast.undoAction!(); dismiss(); }}
            className={`mt-2 flex items-center gap-1 text-xs font-bold hover:cursor-pointer ${COLORS[toast.type]} hover:opacity-80 transition-opacity`}
          >
            <RotateCcw className="w-3 h-3" />
            {toast.undoLabel ?? 'Undo'}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors hover:cursor-pointer mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-[2px] transition-none"
        style={{
          width: `${progress}%`,
          background: `var(--color-${toast.type === 'success' ? 'emerald' : toast.type === 'error' ? 'red' : toast.type === 'warning' ? 'amber' : 'blue'}-500, currentColor)`,
          opacity: 0.5,
        }}
      />
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: ToastType, message: string, opts: Partial<Toast> = {}) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message, ...opts }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctx: ToastContextValue = {
    success: (m, o) => add('success', m, o),
    error: (m, o) => add('error', m, o),
    warning: (m, o) => add('warning', m, o),
    info: (m, o) => add('info', m, o),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
