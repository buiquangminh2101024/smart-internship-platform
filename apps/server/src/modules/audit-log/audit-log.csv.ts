import type { AuditActivityGroup, AuditActivityItem } from "@sip/shared-types";
import { vnDateOf } from "./audit-log.where";

// Xuất CSV nhật ký (docs/06-backend/admin-audit-log/PLAN.md L13). Tự viết, không
// dùng thư viện: chỉ cần bọc ô trong dấu nháy kép và chặn CSV injection.

const BOM = "﻿";

const GROUP_LABELS: Record<AuditActivityGroup, string> = {
  JOB_POST: "Tin tuyển dụng",
  COMPANY: "Công ty",
  CATALOG: "Danh mục",
  PAYMENT: "Thanh toán",
  ACCOUNT: "Tài khoản",
  SECURITY: "Bảo mật",
  OTHER: "Khác",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  EMPLOYER: "Nhà tuyển dụng",
  CANDIDATE: "Ứng viên",
};

const HEADER = [
  "Thời gian",
  "Nhóm",
  "Hành động",
  "Vai trò người làm",
  "Email người làm",
  "Loại đối tượng",
  "Mã đối tượng",
  "Mô tả",
  "Lý do",
  "IP",
];

// Excel/Sheets coi ô bắt đầu bằng các ký tự này là công thức. Thêm tab và CR
// theo khuyến nghị của OWASP.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Một ô CSV: chặn công thức bằng dấu `'` ở đầu, rồi luôn bọc trong dấu nháy kép. */
export function csvCell(value: string | null): string {
  const text = value ?? "";
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** `YYYY-MM-DD HH:mm:ss` theo giờ Việt Nam. */
function vnDateTime(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 19)}`;
}

export function toActivityCsv(items: AuditActivityItem[]): string {
  const lines = [HEADER.map(csvCell).join(",")];
  for (const item of items) {
    lines.push(
      [
        vnDateTime(item.createdAt),
        GROUP_LABELS[item.group],
        item.action,
        item.actorId === null ? "Hệ thống" : (ROLE_LABELS[item.actorRole ?? ""] ?? ""),
        item.actorEmail,
        item.entityType,
        item.entityId,
        item.summary,
        item.reason,
        item.ip,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

/** `nhat-ky-YYYYMMDD.csv` theo ngày Việt Nam. */
export function exportFileName(now: Date): string {
  return `nhat-ky-${vnDateOf(now).replace(/-/g, "")}.csv`;
}
