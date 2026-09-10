"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";

type ToastTone = "danger" | "success" | "info";

export interface ToastData {
  id: number;
  tone: ToastTone;
  message: string;
}

const AUTO_DISMISS_MS = 6000;

const toneConfig: Record<ToastTone, { icon: string; iconClass: string }> = {
  danger: { icon: "circle-alert", iconClass: "text-red-600" },
  success: { icon: "circle-check", iconClass: "text-pine-600" },
  info: { icon: "info", iconClass: "text-indigo-600" },
};

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const { icon, iconClass } = toneConfig[toast.tone];

  return (
    <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-lg">
      <Icon name={icon} size={20} className={`mt-0.5 shrink-0 ${iconClass}`} />
      <p className="flex-1 text-sm text-text-strong">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Đóng thông báo"
        className="shrink-0 cursor-pointer text-text-muted hover:text-text-strong"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export interface ToastViewportProps {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}

/** Đặt 1 lần ở gốc trang, cố định góc trên bên phải (giữa màn hình trên mobile). */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 grid justify-items-center gap-2 sm:inset-x-auto sm:right-4 sm:justify-items-end">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
