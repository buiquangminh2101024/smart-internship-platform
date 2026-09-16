"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface CompanyImageUploadProps {
  label: string;
  variant: "logo" | "banner";
  file: File | null;
  onChange: (file: File | null) => void;
  /** Ảnh đang lưu trên hệ thống — hiện làm preview khi chưa chọn file mới. */
  currentUrl?: string | null | undefined;
  required?: boolean;
  error?: string | null | undefined;
  disabled?: boolean;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function CompanyImageUpload({
  label,
  variant,
  file,
  onChange,
  currentUrl,
  required = false,
  error,
  disabled = false,
}: CompanyImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFile(selected: File | null) {
    if (inputRef.current) inputRef.current.value = "";
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setLocalError("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP");
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setLocalError("Dung lượng tối đa 5MB");
      return;
    }
    setLocalError(null);
    onChange(selected);
  }

  const shownUrl = previewUrl ?? currentUrl ?? null;
  const message = localError ?? error;
  const frameClass = variant === "logo" ? "size-28" : "aspect-[4/1] w-full";

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium text-text-strong">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </span>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        className={`${frameClass} relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-surface-page text-center transition-colors hover:border-pine-400 ${
          message ? "border-red-400" : "border-border-default"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview dạng blob: không đi qua next/image được
          <img src={shownUrl} alt={label} className="size-full object-cover" />
        ) : (
          <div className="grid justify-items-center gap-1 px-3">
            <Icon name="image-plus" size={22} className="text-text-subtle" />
            <span className="text-xs text-text-muted">
              {variant === "logo" ? "Ảnh vuông" : "Ảnh ngang, tỉ lệ ~4:1"} · JPEG/PNG/WebP · tối đa 5MB
            </span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {file ? (
        <button
          type="button"
          className="w-fit text-xs text-text-muted hover:text-text-strong"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          {currentUrl ? "Bỏ chọn, giữ ảnh hiện tại" : "Bỏ chọn ảnh"}
        </button>
      ) : null}
      {message ? <span className="text-sm text-red-600">{message}</span> : null}
    </div>
  );
}
