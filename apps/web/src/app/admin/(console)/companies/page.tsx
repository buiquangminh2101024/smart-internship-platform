"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Company, CompanyVerificationStatus, PaginatedResponse } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<CompanyVerificationStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  VERIFIED: { label: "Đã xác thực", tone: "success" },
  PENDING: { label: "Chờ xác thực", tone: "warning" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
};

const FILTERS: { value: CompanyVerificationStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Chờ xác thực" },
  { value: "VERIFIED", label: "Đã xác thực" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "ALL", label: "Tất cả" },
];

export default function AdminCompaniesPage() {
  const [status, setStatus] = useState<CompanyVerificationStatus | "ALL">("PENDING");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-companies", status],
    queryFn: () => apiFetch<PaginatedResponse<Company>>("admin", `/companies${status === "ALL" ? "" : `?status=${status}`}`),
  });

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold text-text-strong">Quản lý công ty</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.value} variant={status === f.value ? "primary" : "secondary"} size="sm" onClick={() => setStatus(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Đang tải...</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-text-muted">Không có công ty nào.</p>
      ) : (
        <div className="grid gap-3">
          {data.items.map((company) => {
            const statusInfo = STATUS_LABEL[company.verificationStatus];
            return (
              <Card key={company.id} padding="md" className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-strong">{company.name}</p>
                  <p className="text-sm text-text-muted">MST: {company.taxCode ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                  <Button as="a" href={`/admin/companies/${company.id}`} variant="secondary" size="sm">
                    Xem chi tiết
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
