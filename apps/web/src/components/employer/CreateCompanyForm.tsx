"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Company, EmployerProfile, VerificationCheckResponse } from "@sip/shared-types";
import { apiFetch, apiUpload, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useIndustries, useCompanyTypes, useCities } from "@/hooks/useCatalog";
import { BusinessLicenseUpload } from "./BusinessLicenseUpload";
import { CompanyImageUpload } from "./CompanyImageUpload";

const formSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên công ty"),
  taxCode: z.string().trim().min(1, "Vui lòng nhập mã số thuế"),
  industryId: z.string().optional(),
  companyTypeId: z.string().optional(),
  cityId: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  foundedYear: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface CreateCompanyFormProps {
  mode: "create" | "resubmit";
  company?: Company | undefined;
  employer?: EmployerProfile | undefined;
  onDone: () => void;
}

const BLOCKED_REASON_TEXT: Record<string, string> = {
  NO_MAIL_SERVER: "Đuôi email công ty không có máy chủ nhận thư hợp lệ.",
  TAX_CODE_INVALID: "Mã số thuế không đúng định dạng.",
  TAX_CODE_NOT_FOUND: "Không tìm thấy công ty với mã số thuế này.",
  TAX_LOOKUP_FAILED: "Không tra cứu được mã số thuế lúc này, vui lòng thử lại sau.",
};

function outcomeMessage(result: VerificationCheckResponse): string {
  if (result.outcome === "AUTO_VERIFIED") {
    return `Đuôi email công ty khớp với "${result.shortName}" tra cứu được — công ty sẽ được xác thực tự động.`;
  }
  if (result.outcome === "NEEDS_MANUAL_REVIEW") {
    return result.reason === "COMMON_EMAIL_DOMAIN"
      ? "Email công ty dùng đuôi phổ biến (Gmail, Outlook...) nên cần Admin xác thực thủ công. Vui lòng tải lên giấy phép kinh doanh."
      : `Đuôi email chưa khớp với "${result.shortName ?? ""}" tra cứu được — cần Admin xác thực thủ công. Vui lòng tải lên giấy phép kinh doanh.`;
  }
  return BLOCKED_REASON_TEXT[result.reason] ?? "Không xác thực được thông tin.";
}

export function CreateCompanyForm({ mode, company, employer, onDone }: CreateCompanyFormProps) {
  const [checkResult, setCheckResult] = useState<VerificationCheckResponse | null>(null);
  const [forceManualReview, setForceManualReview] = useState(false);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: industries } = useIndustries();
  const { data: companyTypes } = useCompanyTypes();
  const { data: cities } = useCities();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: company?.name ?? "",
      taxCode: company?.taxCode ?? "",
      industryId: company?.industryId ?? "",
      companyTypeId: company?.companyTypeId ?? "",
      cityId: company?.cityId ?? "",
      address: company?.address ?? "",
      description: company?.description ?? "",
      website: company?.website ?? "",
      foundedYear: company?.foundedYear ? String(company.foundedYear) : "",
      title: employer?.title ?? "",
      phone: employer?.phone ?? "",
    },
  });

  const needsLicense = checkResult?.outcome === "NEEDS_MANUAL_REVIEW" || (checkResult?.outcome === "BLOCKED" && forceManualReview);
  const canSubmit = checkResult?.outcome === "AUTO_VERIFIED" || needsLicense;

  async function handleCheck(values: FormValues) {
    setFormError(null);
    setChecking(true);
    try {
      const result = await apiFetch<VerificationCheckResponse>("employer", "/employers/company/verification-check", {
        method: "POST",
        body: JSON.stringify({ taxCode: values.taxCode }),
      });
      setCheckResult(result);
      setForceManualReview(false);
      setLicenseFile(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không kiểm tra được thông tin, vui lòng thử lại");
    } finally {
      setChecking(false);
    }
  }

  async function handleFinalSubmit() {
    if (!checkResult) return;
    // Nộp lại hồ sơ được giữ ảnh cũ — chỉ bắt buộc chọn ảnh khi công ty chưa có.
    const missingLogo = !logoFile && !company?.logoUrl;
    const missingBanner = !bannerFile && !company?.bannerUrl;
    const missingLicense = needsLicense && !licenseFile;
    setLogoError(missingLogo ? "Vui lòng tải lên logo công ty" : null);
    setBannerError(missingBanner ? "Vui lòng tải lên ảnh bìa công ty" : null);
    setLicenseError(missingLicense ? "Vui lòng tải lên giấy phép kinh doanh" : null);
    if (missingLogo || missingBanner || missingLicense) return;

    setFormError(null);
    setSubmitting(true);
    try {
      const values = getValues();
      const formData = new FormData();
      formData.append("name", values.name);
      formData.append("taxCode", values.taxCode);
      if (values.industryId) formData.append("industryId", values.industryId);
      if (values.companyTypeId) formData.append("companyTypeId", values.companyTypeId);
      if (values.cityId) formData.append("cityId", values.cityId);
      if (values.address) formData.append("address", values.address);
      if (values.description) formData.append("description", values.description);
      if (values.website) formData.append("website", values.website);
      if (values.foundedYear) formData.append("foundedYear", values.foundedYear);
      if (values.title) formData.append("title", values.title);
      if (values.phone) formData.append("phone", values.phone);
      if (checkResult.outcome === "BLOCKED" && forceManualReview) formData.append("forceManualReview", "true");
      if (licenseFile) formData.append("businessLicense", licenseFile);
      if (logoFile) formData.append("logo", logoFile);
      if (bannerFile) formData.append("banner", bannerFile);

      await apiUpload("employer", "/employers/company", formData);
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không gửi được thông tin, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  const industryOptions = [{ value: "", label: "Chọn ngành nghề" }, ...(industries ?? []).map((i) => ({ value: i.id, label: i.name }))];
  const companyTypeOptions = [
    { value: "", label: "Chọn loại hình" },
    ...(companyTypes ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const cityOptions = [{ value: "", label: "Chọn thành phố" }, ...(cities ?? []).map((c) => ({ value: c.id, label: c.name }))];

  return (
    <form onSubmit={handleSubmit(handleCheck)} className="grid gap-5">
      <Card padding="sm" tone="sunken">
        <h3 className="mb-3 text-sm font-semibold text-text-strong">Thông tin công ty</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Tên công ty" required {...register("name")} error={errors.name?.message} />
          <Input
            label="Mã số thuế"
            required
            {...register("taxCode")}
            error={errors.taxCode?.message}
            disabled={checkResult !== null}
          />
          <Select label="Ngành nghề" options={industryOptions} {...register("industryId")} />
          <Select label="Loại hình" options={companyTypeOptions} {...register("companyTypeId")} />
          <Select label="Thành phố" options={cityOptions} {...register("cityId")} />
          <Input label="Website" placeholder="https://..." {...register("website")} />
          <Input label="Năm thành lập" inputMode="numeric" maxLength={4} {...register("foundedYear")} />
          <Input label="Địa chỉ" {...register("address")} />
        </div>
        <div className="mt-4">
          <Textarea label="Giới thiệu công ty" {...register("description")} />
        </div>
      </Card>

      <Card padding="sm" tone="sunken">
        <h3 className="mb-3 text-sm font-semibold text-text-strong">Hình ảnh công ty</h3>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <CompanyImageUpload
            label="Logo"
            variant="logo"
            required
            file={logoFile}
            currentUrl={company?.logoUrl}
            error={logoError}
            onChange={(f) => {
              setLogoFile(f);
              setLogoError(null);
            }}
          />
          <CompanyImageUpload
            label="Ảnh bìa (banner)"
            variant="banner"
            required
            file={bannerFile}
            currentUrl={company?.bannerUrl}
            error={bannerError}
            onChange={(f) => {
              setBannerFile(f);
              setBannerError(null);
            }}
          />
        </div>
      </Card>

      <Card padding="sm" tone="sunken">
        <h3 className="mb-3 text-sm font-semibold text-text-strong">Thông tin của bạn</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Chức danh" placeholder="vd. Trưởng phòng nhân sự" {...register("title")} />
          <Input label="Số điện thoại" {...register("phone")} />
        </div>
      </Card>

      {checkResult ? (
        <Card padding="sm" tone={checkResult.outcome === "AUTO_VERIFIED" ? "brand" : "warning"} className="grid gap-3">
          <div className="flex items-center gap-2">
            <Badge tone={checkResult.outcome === "AUTO_VERIFIED" ? "success" : checkResult.outcome === "BLOCKED" ? "danger" : "warning"}>
              {checkResult.outcome === "AUTO_VERIFIED"
                ? "Đủ điều kiện tự động xác thực"
                : checkResult.outcome === "BLOCKED"
                  ? "Không kiểm tra được"
                  : "Cần Admin xác thực thủ công"}
            </Badge>
          </div>
          <p className="text-sm text-text-body">{outcomeMessage(checkResult)}</p>
          {checkResult.outcome === "BLOCKED" && !forceManualReview ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setForceManualReview(true)}>
              Vẫn gửi yêu cầu xác thực thủ công
            </Button>
          ) : null}
        </Card>
      ) : null}

      {needsLicense ? (
        <BusinessLicenseUpload
          file={licenseFile}
          onChange={(f) => {
            setLicenseFile(f);
            setLicenseError(null);
          }}
        />
      ) : null}
      {licenseError ? <p className="text-sm text-red-600">{licenseError}</p> : null}

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      {!checkResult ? (
        <Button type="submit" loading={checking} fullWidth>
          Kiểm tra thông tin
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => setCheckResult(null)}>
            Sửa lại thông tin
          </Button>
          {canSubmit ? (
            <Button type="button" loading={submitting} fullWidth onClick={handleFinalSubmit}>
              {mode === "resubmit" ? "Nộp lại hồ sơ" : "Hoàn tất đăng ký"}
            </Button>
          ) : null}
        </div>
      )}
    </form>
  );
}
