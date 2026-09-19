import type { CatalogAliasSource, CatalogEntryStatus } from "@prisma/client";

// Hợp đồng chung của university.repository.ts và major.repository.ts. Hai model
// Prisma khác nhau (khác delegate, khác tên cột FK) nên phải là hai class, nhưng
// service/dedupe/cron chỉ cần làm việc qua interface này — không phải viết mọi
// hành động Admin hai lần.

export type EducationCatalogDomain = "university" | "major";

export interface CatalogEntryRow {
  id: string;
  name: string;
  status: CatalogEntryStatus;
}

export interface AdminEducationCatalogRow {
  id: string;
  name: string;
  code: string | null;
  status: CatalogEntryStatus;
  createdByEmail: string | null;
  pendingMatch: { id: string; name: string } | null;
  usageCount: number;
  createdAt: Date;
}

export interface PendingCatalogVerification {
  id: string;
  name: string;
  pendingMatch: { id: string; name: string };
}

export interface EducationCatalogRepository {
  findById(id: string): Promise<CatalogEntryRow | null>;
  findAdminRow(id: string): Promise<AdminEducationCatalogRow | null>;
  /** Mọi mục (APPROVED + PENDING) — catalog vài nghìn dòng, so khớp trong RAM. */
  listForMatching(): Promise<CatalogEntryRow[]>;
  /** Tra alias theo tên ĐÃ chuẩn hoá (bậc 0). */
  findByAlias(aliasKey: string): Promise<CatalogEntryRow | null>;
  /** Trùng tên không phân biệt hoa/thường, trừ `excludeId`. */
  findByNameInsensitive(name: string, excludeId?: string): Promise<CatalogEntryRow | null>;
  createPending(data: { name: string; createdByUserId: string; pendingMatchId: string | null }): Promise<CatalogEntryRow>;
  findPendingVerification(limit: number): Promise<PendingCatalogVerification[]>;
  clearPendingMatch(id: string): Promise<void>;
  listForAdmin(
    status: CatalogEntryStatus | undefined,
    cursor: string | undefined,
  ): Promise<{ items: AdminEducationCatalogRow[]; hasMore: boolean; nextCursor?: string }>;
  approve(id: string): Promise<void>;
  /** Đổi tên + duyệt; tên cũ được giữ lại thành alias của chính mục này. */
  renameApprove(id: string, correctedName: string): Promise<void>;
  reject(id: string): Promise<void>;
  merge(sourceId: string, targetId: string, aliasSource: CatalogAliasSource): Promise<void>;
}
