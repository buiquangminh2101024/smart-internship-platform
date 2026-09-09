"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface BusinessLicenseUploadProps {
  file: File | null;
  onChange: (file: File | null) => void;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export function BusinessLicenseUpload({ file, onChange }: BusinessLicenseUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(selected: File | null) {
    if (!selected) {
      onChange(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError("Chỉ chấp nhận ảnh JPEG/PNG hoặc PDF");
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setError("Dung lượng tối đa 5MB");
      return;
    }
    setError(null);
    onChange(selected);
  }

  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium text-text-strong">
        Giấy phép kinh doanh <span className="text-red-600">*</span>
      </label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-default bg-surface-page px-4 py-8 text-center transition-colors hover:border-pine-400"
      >
        <Icon name="upload" size={22} className="text-text-subtle" />
        {file ? (
          <span className="text-sm font-medium text-text-strong">{file.name}</span>
        ) : (
          <span className="text-sm text-text-muted">Nhấn để chọn ảnh (JPEG/PNG) hoặc PDF, tối đa 5MB</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </div>
  );
}
