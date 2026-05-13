"use client";

/**
 * Tiny in-house toast system — no new deps. A `ToastProvider` mounted in the
 * app shell exposes a `useToast()` hook that any client component can call to
 * surface non-blocking success/error/info messages.
 *
 * Replaces the inline "Saved — appears in the gallery below" / red error
 * banners that previously froze the interaction area while images were loading.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (m: string) => push("success", m),
      error: (m: string) => push("error", m),
      info: (m: string) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  useEffect(() => {
    const ms = toast.kind === "error" ? 6000 : 3500;
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const Icon =
    toast.kind === "success"
      ? CheckCircle2
      : toast.kind === "error"
        ? AlertCircle
        : Info;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md animate-toast-in",
        toast.kind === "success" &&
          "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200",
        toast.kind === "error" &&
          "border-red-200 bg-red-50/95 text-red-800 dark:border-red-900 dark:bg-red-950/80 dark:text-red-200",
        toast.kind === "info" &&
          "border-zinc-200 bg-white/95 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-200",
      )}
    >
      <Icon className="mt-px size-4 shrink-0" />
      <span className="flex-1 leading-relaxed">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-0.5 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe fallback so server-rendered code paths and unit tests don't crash;
    // toasts in those contexts are silently dropped.
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
