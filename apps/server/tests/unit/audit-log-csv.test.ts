// Chạy: node --import tsx --test tests/unit/audit-log-csv.test.ts (từ apps/server)
// Xuất CSV nhật ký (docs/06-backend/admin-audit-log/PLAN.md L13): escape dấu nháy, xuống
// dòng, chặn CSV injection, BOM UTF-8, giờ Việt Nam.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuditActivityItem } from "@sip/shared-types";
import { csvCell, exportFileName, toActivityCsv } from "../../src/modules/audit-log/audit-log.csv";

test("csvCell: bọc nháy kép, nhân đôi dấu nháy, giữ xuống dòng trong ô", () => {
  assert.equal(csvCell("Công ty A, B"), '"Công ty A, B"');
  assert.equal(csvCell('Tin "Thực tập"'), '"Tin ""Thực tập"""');
  assert.equal(csvCell("dòng 1\ndòng 2"), '"dòng 1\ndòng 2"');
  assert.equal(csvCell(null), '""');
});

test("csvCell: ô bắt đầu bằng = + - @ tab CR thì thêm dấu ' ở đầu", () => {
  for (const value of ["=HYPERLINK(\"x\")", "+1", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
    assert.equal(csvCell(value).slice(0, 2), `"'`, value);
  }
  assert.equal(csvCell("a=b"), '"a=b"');
});

test("toActivityCsv: BOM, dòng tiêu đề, giờ Việt Nam, người làm hệ thống", () => {
  const item: AuditActivityItem = {
    id: "a1",
    actorId: null,
    actorRole: null,
    actorEmail: null,
    action: "AUTH_LOGIN_FAILED_REPEATED",
    entityType: "User",
    entityId: "u-1",
    summary: "=cmd",
    reason: null,
    createdAt: "2026-10-18T17:30:05.000Z",
    group: "SECURITY",
    ip: "203.0.113.7",
    resubmit: null,
    companyId: null,
  };
  const lines = toActivityCsv([item]).split("\r\n");
  assert.ok(lines[0]!.startsWith('﻿"Thời gian","Nhóm"'));
  assert.equal(
    lines[1],
    '"2026-10-19 00:30:05","Bảo mật","AUTH_LOGIN_FAILED_REPEATED","Hệ thống","","User","u-1","\'=cmd","","203.0.113.7"',
  );
  assert.equal(lines[2], "");
});

test("exportFileName theo ngày Việt Nam", () => {
  assert.equal(exportFileName(new Date("2026-10-18T16:59:59Z")), "nhat-ky-20261018.csv");
  assert.equal(exportFileName(new Date("2026-10-18T17:00:00Z")), "nhat-ky-20261019.csv");
});
