"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSkillDto, CatalogItem, PaginatedResponse, SkillStatus } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useSkills } from "@/hooks/useCatalog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

const FILTERS: { value: SkillStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "APPROVED", label: "Đã duyệt" },
  { value: "ALL", label: "Tất cả" },
];

/**
 * Hàng đợi duyệt kỹ năng do Candidate/Employer tự đề xuất. Bố cục theo
 * `admin/(console)/companies` (danh sách thẻ + hành động ngay trên hàng) —
 * xem docs/05-frontend/phases/jobpost-skill-huong-b/PLAN.md (FE-5).
 *
 * Phần lớn kỹ năng trùng lặp đã được pipeline + cron LLM gộp tự động trước khi
 * tới đây; những gì còn lại là ca máy không chắc chắn, cần người quyết định.
 */
export default function AdminSkillsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SkillStatus | "ALL">("PENDING");
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["adminSkills", status],
    queryFn: () =>
      apiFetch<PaginatedResponse<AdminSkillDto>>(
        "admin",
        `/admin/skills${status === "ALL" ? "" : `?status=${status}`}`,
      ),
  });

  const mutation = useMutation({
    mutationFn: ({ id, action, targetSkillId }: { id: string; action: "approve" | "reject" | "merge"; targetSkillId?: string }) =>
      apiFetch("admin", `/admin/skills/${id}/${action}`, {
        method: "POST",
        ...(targetSkillId ? { body: JSON.stringify({ targetSkillId }) } : {}),
      }),
    onSuccess: async () => {
      setMergingId(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["adminSkills"] });
      // Danh mục công khai đổi theo (approve thêm mục mới, merge/reject bớt đi).
      await queryClient.invalidateQueries({ queryKey: ["catalog", "skills"] });
    },
    onError: (cause) => {
      setError(cause instanceof ApiError ? cause.message : "Không thực hiện được thao tác, vui lòng thử lại");
    },
  });

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Quản lý kỹ năng</h1>
        <p className="text-sm text-text-muted">
          Kỹ năng do người dùng tự đề xuất. Duyệt để đưa vào danh mục chung, gộp nếu trùng với kỹ năng đã có, hoặc từ
          chối nếu không hợp lệ.
        </p>
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {isLoading ? (
        <p className="text-sm text-text-muted">Đang tải...</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-text-muted">Không có kỹ năng nào.</p>
      ) : (
        <div className="grid gap-3">
          {data.items.map((skill) => (
            <Card key={skill.id} padding="md" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-strong">{skill.name}</p>
                  <p className="text-sm text-text-muted">
                    {skill.createdByEmail ?? "Hệ thống"} · {new Date(skill.createdAt).toLocaleDateString("vi-VN")} ·{" "}
                    {skill.usageCount} nơi đang dùng
                  </p>
                  {skill.pendingMatchSkill ? (
                    <p className="text-sm text-marigold-700">
                      Có thể trùng với &ldquo;{skill.pendingMatchSkill.name}&rdquo;
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge tone={skill.status === "PENDING" ? "warning" : "success"}>
                    {skill.status === "PENDING" ? "Chờ duyệt" : "Đã duyệt"}
                  </Badge>
                  {skill.status === "PENDING" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: skill.id, action: "approve" })}
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() => setMergingId(mergingId === skill.id ? null : skill.id)}
                      >
                        Gộp
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: skill.id, action: "reject" })}
                      >
                        Từ chối
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {mergingId === skill.id ? (
                <MergePanel
                  skill={skill}
                  disabled={mutation.isPending}
                  onCancel={() => setMergingId(null)}
                  onConfirm={(targetSkillId) => mutation.mutate({ id: skill.id, action: "merge", targetSkillId })}
                />
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Chọn kỹ năng đích để gộp. Mở ngay trong thẻ thay vì modal/trang riêng — thao
 * tác chỉ gồm một lựa chọn, không đáng phải điều hướng.
 */
function MergePanel({
  skill,
  disabled,
  onCancel,
  onConfirm,
}: {
  skill: AdminSkillDto;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: (targetSkillId: string) => void;
}) {
  const { data: catalog } = useSkills();
  const [query, setQuery] = useState(skill.pendingMatchSkill?.name ?? "");

  const keyword = query.trim().toLowerCase();
  const matches: CatalogItem[] = (catalog ?? [])
    .filter((item) => item.id !== skill.id && (!keyword || item.name.toLowerCase().includes(keyword)))
    .slice(0, 8);

  return (
    <div className="grid gap-2 rounded-lg bg-surface-page p-3">
      <p className="text-sm text-text-body">
        Gộp &ldquo;{skill.name}&rdquo; vào kỹ năng đã duyệt nào? Mọi hồ sơ/tin đang dùng sẽ được chuyển sang kỹ năng đích.
      </p>
      <Input
        icon="search"
        aria-label="Tìm kỹ năng đích"
        placeholder="Tìm kỹ năng đã duyệt"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {matches.length === 0 ? (
          <p className="text-sm text-text-muted">Không tìm thấy kỹ năng phù hợp.</p>
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
