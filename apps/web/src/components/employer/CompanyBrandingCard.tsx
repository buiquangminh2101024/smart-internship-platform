"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Company, EmployerMeResponse } from "@sip/shared-types";
import { apiUpload, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CompanyImageUpload } from "./CompanyImageUpload";

export interface CompanyBrandingCardProps {
  company: Company;
  canEdit: boolean;
}

export function CompanyBrandingCard({ company, canEdit }: CompanyBrandingCardProps) {
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!logoFile && !bannerFile) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const formData = new FormData();
      if (logoFile) formData.append("logo", logoFile);
      if (bannerFile) formData.append("banner", bannerFile);
      await apiUpload<EmployerMeResponse>("employer", "/employers/company/branding", formData, "PATCH");
      await queryClient.invalidateQueries({ queryKey: ["employerMe"] });
      setLogoFile(null);
      setBannerFile(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được hình ảnh, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-text-strong">Hình ảnh công ty</h2>
        {!canEdit ? (
          <p className="text-sm text-text-muted">Chỉ quản trị viên công ty mới có thể thay đổi logo và ảnh bìa.</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <CompanyImageUpload
          label="Logo"
          variant="logo"
          file={logoFile}
          currentUrl={company.logoUrl}
          disabled={!canEdit || saving}
          onChange={(f) => {
            setLogoFile(f);
            setSaved(false);
          }}
        />
        <CompanyImageUpload
          label="Ảnh bìa (banner)"
          variant="banner"
          file={bannerFile}
          currentUrl={company.bannerUrl}
          disabled={!canEdit || saving}
          onChange={(f) => {
            setBannerFile(f);
            setSaved(false);
          }}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="text-sm text-pine-700">Đã cập nhật hình ảnh công ty.</p> : null}
      {canEdit ? (
        <Button type="button" loading={saving} disabled={!logoFile && !bannerFile} onClick={() => void handleSave()}>
          Lưu hình ảnh
        </Button>
      ) : null}
    </Card>
  );
}
