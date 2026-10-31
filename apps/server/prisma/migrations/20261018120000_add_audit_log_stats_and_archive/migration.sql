-- AD-20 (docs/06-backend/admin-audit-log/PLAN.md L14, L16, L20). Hai index trên audit_logs cho
-- lọc theo người làm và theo nhóm (action IN (...)): đo trên 200.000 dòng giả, lọc một người làm
-- ít thao tác phải quét cả bảng (Seq Scan, ~26 ms). Bảng thống kê theo giờ cho biểu đồ và bảng
-- lưu trữ cho dòng cũ hơn AUDIT_RETENTION_DAYS (không bao giờ xoá).

-- CreateTable
CREATE TABLE "audit_log_hourly_stats" (
    "id" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "actionGroup" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "count" INTEGER NOT NULL,

    CONSTRAINT "audit_log_hourly_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs_archive" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_hourly_stats_bucketStart_idx" ON "audit_log_hourly_stats"("bucketStart");

-- CreateIndex
CREATE INDEX "audit_logs_archive_createdAt_idx" ON "audit_logs_archive"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_archive_entityType_entityId_idx" ON "audit_logs_archive"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

