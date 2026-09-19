"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminEducationCatalogEntryDto, CatalogEntryStatus, CatalogItem, PaginatedResponse } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useMajors, useUniversities } from "@/hooks/useCatalog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Domain = "university" | "major";
type Action = "approve" | "reject" | "merge" | "rename-approve";

const DOMAINS: Record<Domain, { label: string; path: string; queryKey: string; catalogKey: string; noun: string }> = {
  university: { label: "Trường", path: "universities", queryKey: "adminUniversities", catalogKey: "universities", noun: "trường" },
  major: { label: "Ngành", path: "majors", queryKey: "adminMajors", catalogKey: "majors", noun: "ngành" },
};

const FILTERS: { value: CatalogEntryStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "ALL", label: "Tất cả" },
];

/**
 * Hàng đợi duyệt trường/ngành do Candidate đề xuất (chủ yếu từ "Lưu vào hồ sơ"
 * sau khi AI đọc CV) — docs/05-frontend/phases/cv-ai-extraction-phase2/PLAN.md
 * FE-3. Cùng bố cục với admin/(console)/skills, gộp 2 danh mục thành 2 tab và
 * thêm hành động "Sửa tên & duyệt".
 */
export default function AdminEducationCatalogPage() {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState<Domain>("university");
  const [status, setStatus] = useState<CatalogEntryStatus | "ALL">("PENDING");
  // Chỉ một bảng thao tác mở tại một thời điểm (gộp HOẶC sửa tên).
  const [panel, setPanel] = useState<{ id: string; kind: "merge" | "rename" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = DOMAINS[domain];

  const query = useInfiniteQuery({
    queryKey: [config.queryKey, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (pageParam) params.set("cursor", pageParam);
      const search = params.toString();
      return apiFetch<PaginatedResponse<AdminEducationCatalogEntryDto>>(
        "admin",
        `/admin/${config.path}${search ? `?${search}` : ""}`,
      );
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      targetId,
      correctedName,
    }: {
      id: string;
      action: Action;
      targetId?: string;
      correctedName?: string;
    }) =>
      apiFetch("admin", `/admin/${config.path}/${id}/${action}`, {
        method: "POST",
        ...(targetId ? { body: JSON.stringify({ targetId }) } : {}),
        ...(correctedName ? { body: JSON.stringify({ correctedName }) } : {}),
      }),
    onSuccess: async () => {
      setPanel(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      // Danh mục công khai đổi theo (duyệt thêm mục mới, gộp/từ chối bớt đi).
      await queryClient.invalidateQueries({ queryKey: ["catalog", config.catalogKey] });
    },
    onError: (cause) => {
      // Gồm cả 409 "sửa tên trùng một mục đã duyệt → dùng Gộp" — message backend đã rõ ràng.
      setError(cause instanceof ApiError ? cause.message : "Không thực hiện được thao tác, vui lòng thử lại");
    },
  });

  function switchDomain(next: Domain) {
    setDomain(next);
    setPanel(null);
    setError(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Danh mục học vấn</h1>
        <p className="text-sm text-text-muted">
          Trường và ngành do ứng viên đề xuất (thường từ CV). Duyệt nếu là mục mới hợp lệ, sửa tên &amp; duyệt nếu tên
          chưa chuẩn, gộp nếu trùng với mục đã có, hoặc từ chối nếu không hợp lệ.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-surface-hover p-1" role="tablist" aria-label="Loại danh mục">
          {(Object.keys(DOMAINS) as Domain[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={domain === key}
              onClick={() => switchDomain(key)}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                domain === key ? "bg-surface-card text-text-strong shadow-sm" : "text-text-muted hover:text-text-strong"
              }`}
            >
              {DOMAINS[key].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={status === filter.value ? "primary" : "secondary"}
              size="sm"
              onClick={() => setStatus(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {query.isLoading ? (
        <p className="text-sm text-text-muted">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">Không có {config.noun} nào.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((entry) => (
            <Card key={entry.id} padding="md" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-text-strong">
                    {entry.name}
                    {entry.code ? <span className="ml-2 text-sm font-normal text-text-muted">{entry.code}</span> : null}
                  </p>
                  <p className="text-sm text-text-muted">
                    {entry.createdByEmail ?? "Hệ thống"} · {new Date(entry.createdAt).toLocaleDateString("vi-VN")} ·{" "}
                    {entry.usageCount} hồ sơ đang dùng
                  </p>
                  {entry.pendingMatch ? (
                    <p className="text-sm text-marigold-700">Có thể trùng với &ldquo;{entry.pendingMatch.name}&rdquo;</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge tone={entry.status === "PENDING" ? "warning" : "success"}>
                    {entry.status === "PENDING" ? "Chờ duyệt" : "Đã duyệt"}
                  </Badge>
                  {entry.status === "PENDING" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: entry.id, action: "approve" })}
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() =>
                          setPanel(panel?.id === entry.id && panel.kind === "rename" ? null : { id: entry.id, kind: "rename" })
                        }
                      >
                        Sửa tên &amp; duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() =>
                          setPanel(panel?.id === entry.id && panel.kind === "merge" ? null : { id: entry.id, kind: "merge" })
                        }
                      >
                        Gộp
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: entry.id, action: "reject" })}
                      >
                        Từ chối
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {panel?.id === entry.id && panel.kind === "merge" ? (
                <MergePanel
                  domain={domain}
                  entry={entry}
                  disabled={mutation.isPending}
                  onCancel={() => setPanel(null)}
                  onConfirm={(targetId) => mutation.mutate({ id: entry.id, action: "merge", targetId })}
                />
              ) : null}
              {panel?.id === entry.id && panel.kind === "rename" ? (
                <RenamePanel
                  entry={entry}
                  noun={config.noun}
                  disabled={mutation.isPending}
                  onCancel={() => setPanel(null)}
                  onConfirm={(correctedName) => mutation.mutate({ id: entry.id, action: "rename-approve", correctedName })}
                />
              ) : null}
            </Card>
          ))}
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Tải thêm
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Chọn mục đích để gộp — chỉ trong danh mục đã duyệt (backend chặn gộp vào mục
 * PENDING). Mở ngay trong thẻ như trang Kỹ năng.
 */
function MergePanel({
  domain,
  entry,
  disabled,
  onCancel,
  onConfirm,
}: {
  domain: Domain;
  entry: AdminEducationCatalogEntryDto;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: (targetId: string) => void;
}) {
  // Gọi cả 2 hook (luật hook), chỉ dùng danh mục đúng tab — cả 2 đều cache 5 phút.
  const universities = useUniversities();
  const majors = useMajors();
  const catalog = (domain === "university" ? universities.data : majors.data) ?? [];
  const [query, setQuery] = useState(entry.pendingMatch?.name ?? "");
  const noun = DOMAINS[domain].noun;

  const keyword = query.trim().toLowerCase();
  const matches: CatalogItem[] = catalog
    .filter((item) => item.id !== entry.id && (!keyword || item.name.toLowerCase().includes(keyword)))
    .slice(0, 8);

  return (
    <div className="grid gap-2 rounded-lg bg-surface-page p-3">
      <p className="text-sm text-text-body">
        Gộp &ldquo;{entry.name}&rdquo; vào {noun} đã duyệt nào? Mọi hồ sơ đang dùng sẽ được chuyển sang {noun} đích, tên cũ
        được ghi nhớ để lần sau tự khớp.
      </p>
      <Input
        icon="search"
        aria-label={`Tìm ${noun} đích`}
        placeholder={`Tìm ${noun} đã duyệt`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {matches.length === 0 ? (
          <p className="text-sm text-text-muted">Không tìm thấy {noun} phù hợp.</p>
        ) : (
          matches.map((item) => (
            <Button key={item.id} size="sm" variant="secondary" disabled={disabled} onClick={() => onConfirm(item.id)}>
              {item.name}
            </Button>
          ))
        )}
      </div>
      <div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

/** Mục là mới thật nhưng tên chưa chuẩn (viết tắt, sai hoa/thường) → sửa rồi duyệt luôn. */
function RenamePanel({
  entry,
  noun,
  disabled,
  onCancel,
  onConfirm,
}: {
  entry: AdminEducationCatalogEntryDto;
  noun: string;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: (correctedName: string) => void;
}) {
  const [name, setName] = useState(entry.name);
  const trimmed = name.trim();

  return (
    <div className="grid gap-2 rounded-lg bg-surface-page p-3">
      <p className="text-sm text-text-body">
        Nhập tên chuẩn cho {noun} này. Nếu tên trùng với một {noun} đã duyệt, hãy dùng &ldquo;Gộp&rdquo; thay vì đổi tên.
      </p>
      <Input aria-label={`Tên ${noun} chuẩn`} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={disabled || !trimmed} onClick={() => onConfirm(trimmed)}>
          Xác nhận &amp; duyệt
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </div>
  );
}
