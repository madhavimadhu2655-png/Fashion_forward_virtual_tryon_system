import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";

type ToastTone = "neutral" | "success" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; to: string };
}

interface ToastContextValue {
  notify: (message: string, options?: { tone?: ToastTone; action?: { label: string; to: string } }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback<ToastContextValue["notify"]>(
    (message, options) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone: options?.tone ?? "neutral", action: options?.action }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), 4500));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`sheet-up pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-control px-4 py-3 text-sm shadow-lift ${
              toast.tone === "error" ? "bg-danger text-ivory" : "bg-ink text-ivory"
            }`}
          >
            <Icon name={toast.tone === "error" ? "alert" : "check"} size={18} className="shrink-0 opacity-80" />
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <Link to={toast.action.to} className="font-semibold underline underline-offset-4" onClick={() => dismiss(toast.id)}>
                {toast.action.label}
              </Link>
            )}
            <button type="button" className="-mr-1 rounded-full p-1 opacity-70 hover:opacity-100" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
