// Chạy: node --import tsx --test tests/unit/audit-log-where.test.ts (từ apps/server)
// Bộ lọc nhật ký (docs/06-backend/admin-audit-log/PLAN.md L7, L27–L29, L33): kiểm tham số
// ở DTO (các lỗi 400) và `where` dựng ra từ bộ lọc, gồm khung giờ của ô thứ × giờ, và bản SQL
// của cùng bộ lọc dùng cho `dayCounts` (plan admin-activity-v2 N11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  activityListQuerySchema,
  activityStatsQuerySchema,
} from "../../src/modules/audit-log/audit-log.dto";
import {
  buildActivityWhere,
  buildActivityWhereSql,
  hourSlots,
  vnDayStart,
  type ActivityFilter,
} from "../../src/modules/audit-log/audit-log.where";

function listError(query: Record<string, string>): string | undefined {
  const result = activityListQuerySchema.safeParse(query);
  return result.success ? undefined : result.error.issues.map((issue) => issue.message).join(", ");
}

test("DTO: tham số cũ của dashboard vẫn nhận, nhiều giá trị ngăn bằng dấu phẩy", () => {
  const legacy = activityListQuerySchema.parse({ limit: "6", actor: "admin" });
  assert.equal(legacy.actor, "admin");
  assert.equal(legacy.order, "desc");
  assert.equal(legacy.archived, false);

  const multi = activityListQuerySchema.parse({ group: "SECURITY,JOB_POST", actorRole: "ADMIN,SYSTEM", archived: "1" });
  assert.deepEqual(multi.group, ["SECURITY", "JOB_POST"]);
  assert.deepEqual(multi.actorRole, ["ADMIN", "SYSTEM"]);
  assert.equal(multi.archived, true);
});

test("DTO: các lỗi 400", () => {
  assert.match(listError({ action: "JOB_POST_DELETED" })!, /Unknown action/);
  assert.match(listError({ action: Array.from({ length: 11 }, (_, i) => `A${i}`).join(",") })!, /action/);
  assert.match(listError({ resubmit: "true" })!, /resubmit/);
  assert.match(listError({ action: "JOB_POST_APPROVED", resubmit: "true" })!, /resubmit/);
  assert.match(listError({ actor: "admin", actorRole: "ADMIN" })!, /actor or actorRole/);
  assert.match(listError({ from: "2026-10-10", to: "2026-10-01" })!, /from must not be after to/);
  assert.match(listError({ from: "2025-01-01", to: "2026-01-02" })!, /366 days/);
  assert.match(listError({ since: "2026-10-01T08:00:00+07:00", from: "2026-10-01" })!, /since\/until/);
  assert.match(listError({ since: "2026-10-01T09:00:00Z", until: "2026-10-01T08:00:00Z" })!, /since must be before until/);
  assert.match(listError({ dow: "2" })!, /together/);
  assert.match(listError({ dow: "2", hour: "9" })!, /full range/);
  assert.match(listError({ entityType: "JobPost" })!, /together/);
  assert.match(listError({ order: "asc" })!, /order=asc/);
  assert.match(listError({ limit: "200" })!, /at most 50/);
  assert.match(listError({ q: "a" })!, /at least 2/);
});

test("DTO: hợp lệ — resubmit với hai hành động gửi, order=asc với actorId, đủ 366 ngày", () => {
  assert.equal(listError({ action: "JOB_POST_SUBMITTED,JOB_POST_AUTO_PUBLISHED", resubmit: "false" }), undefined);
  assert.equal(listError({ actorId: "u-1", order: "asc", limit: "200" }), undefined);
  assert.equal(listError({ entityType: "JobPost", entityId: "j-1", order: "asc", limit: "200" }), undefined);
  assert.equal(listError({ from: "2025-10-18", to: "2026-10-18" }), undefined);
  assert.equal(listError({ dow: "7", hour: "23", from: "2026-10-01", to: "2026-10-18" }), undefined);
  // /stats có sẵn mặc định 30 ngày ⇒ dow/hour không cần khoảng ngày.
  assert.equal(activityStatsQuerySchema.safeParse({ dow: "1", hour: "0" }).success, true);
});

test("hourSlots: Thứ Hai 0 giờ giờ Việt Nam là 17:00 UTC Chủ Nhật, đủ 53 khung trong 366 ngày", () => {
  // 2026-10-19 là Thứ Hai.
  const week = hourSlots({ gte: vnDayStart("2026-10-19"), lt: vnDayStart("2026-10-26") }, 1, 0);
  assert.deepEqual(week, [{ gte: new Date("2026-10-18T17:00:00Z"), lt: new Date("2026-10-18T18:00:00Z") }]);

  const year = hourSlots({ gte: vnDayStart("2025-10-20"), lt: vnDayStart("2026-10-21") }, 1, 9);
  assert.equal(year.length, 53);
  assert.equal(year[0]!.gte.toISOString(), "2025-10-20T02:00:00.000Z");
  assert.equal(year[52]!.gte.toISOString(), "2026-10-19T02:00:00.000Z");
});

test("hourSlots: cắt theo hai đầu khoảng since/until", () => {
  const slots = hourSlots(
    { gte: new Date("2026-10-19T02:30:00Z"), lt: new Date("2026-10-19T02:45:00Z") },
    1,
    9,
  );
  assert.deepEqual(slots, [{ gte: new Date("2026-10-19T02:30:00Z"), lt: new Date("2026-10-19T02:45:00Z") }]);
  assert.deepEqual(hourSlots({ gte: vnDayStart("2026-10-20"), lt: vnDayStart("2026-10-21") }, 1, 9), []);
});

test("buildActivityWhere: nhóm giao với action, vai trò SYSTEM, q khớp người làm hoặc đối tượng", () => {
  const where = buildActivityWhere({
    groups: ["JOB_POST"],
    actions: ["JOB_POST_SUBMITTED", "AUTH_LOGIN_SUCCEEDED"],
    actorRoles: ["ADMIN", "SYSTEM"],
    qUserIds: ["u-1"],
  });
  assert.deepEqual(where, {
    AND: [
      { action: { in: ["JOB_POST_SUBMITTED"] } },
      { OR: [{ actorRole: "ADMIN" }, { actorId: null }] },
      { OR: [{ actorId: { in: ["u-1"] } }, { entityType: "User", entityId: { in: ["u-1"] } }] },
    ],
  });
  assert.deepEqual(buildActivityWhere({ qUserIds: ["u-1"] }, { qMatch: "actor" }), {
    AND: [{ actorId: { in: ["u-1"] } }],
  });
  assert.deepEqual(buildActivityWhere({ qUserIds: [] }), { AND: [{ id: { in: [] } }] });
  assert.deepEqual(buildActivityWhere({}), {});
});

test("buildActivityWhere: bỏ chiều theo `omit`, resubmit=false gồm dòng thiếu khoá", () => {
  const filter = { groups: ["SECURITY" as const], actorRoles: ["ADMIN" as const], resubmit: false };
  assert.deepEqual(buildActivityWhere(filter, { omit: ["group", "actorRole"] }), {
    AND: [
      {
        OR: [
          { NOT: { metadata: { path: ["resubmit"], equals: true } } },
          { metadata: { path: ["resubmit"], equals: Prisma.AnyNull } },
        ],
      },
    ],
  });
});

test("buildActivityWhere: ô thứ × giờ thành OR các khung createdAt", () => {
  const range = { gte: vnDayStart("2026-10-01"), lt: vnDayStart("2026-10-15") };
  const where = buildActivityWhere({ range, slot: { dow: 2, hour: 9 } });
  assert.deepEqual(where, {
    AND: [
      { createdAt: { gte: range.gte, lt: range.lt } },
      {
        OR: [
          { createdAt: { gte: new Date("2026-10-06T02:00:00Z"), lt: new Date("2026-10-06T03:00:00Z") } },
          { createdAt: { gte: new Date("2026-10-13T02:00:00Z"), lt: new Date("2026-10-13T03:00:00Z") } },
        ],
      },
    ],
  });
});

// ─── buildActivityWhereSql (dayCounts) ─────────────────────────────────────

const FULL_FILTER: ActivityFilter = {
  groups: ["JOB_POST"],
  actions: ["JOB_POST_SUBMITTED", "PAYMENT_COMPLETED"],
  resubmit: true,
  actorRoles: ["EMPLOYER", "SYSTEM"],
  actorId: "emp-1",
  range: { gte: vnDayStart("2026-10-01"), lt: vnDayStart("2026-10-15") },
  slot: { dow: 2, hour: 9 },
  qUserIds: ["u-1"],
  entity: { type: "JobPost", id: "job-1" },
};

test("buildActivityWhereSql: không lọc gì thì TRUE; nhóm giao action ra rỗng hoặc q không khớp ai thì FALSE", () => {
  assert.equal(buildActivityWhereSql({}).sql, "TRUE");
  assert.equal(buildActivityWhereSql({ groups: ["SECURITY"], actions: ["JOB_POST_APPROVED"] }).sql, "FALSE");
  assert.equal(buildActivityWhereSql({ qUserIds: [] }).sql, "FALSE");
});

test("buildActivityWhereSql: đủ mọi khoá của bộ lọc, giá trị đi qua tham số", () => {
  const { sql, values } = buildActivityWhereSql(FULL_FILTER);
  // Nhóm giao action (L27): PAYMENT_COMPLETED không thuộc JOB_POST nên bị bỏ.
  assert.match(sql, /^"action" IN \(\?\)/);
  assert.equal(values[0], "JOB_POST_SUBMITTED");
  assert.match(sql, /\("metadata" -> 'resubmit'\) = 'true'::jsonb/);
  assert.match(sql, /\("actorRole"::text = \? OR "actorId" IS NULL\)/);
  assert.match(sql, /"actorId" = \?/);
  assert.match(sql, /"createdAt" >= \(\?::timestamptz AT TIME ZONE 'UTC'\)/);
  // Hai khung 9:00 thứ Ba trong khoảng, cùng khung với bản Prisma.
  assert.equal(sql.match(/\("createdAt" >= .*? AND "createdAt" < .*?\)/g)?.length, 2);
  assert.match(sql, /\("actorId" IN \(\?\) OR \("entityType" = 'User' AND "entityId" IN \(\?\)\)\)/);
  assert.match(sql, /"entityType" = \? AND "entityId" = \?$/);
  for (const value of ["EMPLOYER", "emp-1", "u-1", "JobPost", "job-1", "2026-10-06T02:00:00.000Z", "2026-10-13T03:00:00.000Z"]) {
    assert.ok(values.includes(value), `thiếu tham số ${value}`);
  }
  assert.ok(!sql.includes("emp-1") && !sql.includes("job-1"), "giá trị không được nối thẳng vào câu SQL");
});

test("buildActivityWhereSql: resubmit=false là mọi dòng khác true, gồm metadata null hoặc thiếu khoá", () => {
  assert.equal(
    buildActivityWhereSql({ resubmit: false }).sql,
    `("metadata" -> 'resubmit') IS DISTINCT FROM 'true'::jsonb`,
  );
});

test("buildActivityWhereSql và buildActivityWhere cùng dùng mọi khoá của bộ lọc", () => {
  const full = { prisma: JSON.stringify(buildActivityWhere(FULL_FILTER)), sql: buildActivityWhereSql(FULL_FILTER) };
  for (const key of Object.keys(FULL_FILTER) as Array<keyof ActivityFilter>) {
    const without: ActivityFilter = { ...FULL_FILTER, [key]: undefined };
    const sql = buildActivityWhereSql(without);
    assert.notEqual(JSON.stringify(buildActivityWhere(without)), full.prisma, `bản Prisma bỏ qua ${key}`);
    assert.ok(
      sql.sql !== full.sql.sql || JSON.stringify(sql.values) !== JSON.stringify(full.sql.values),
      `bản SQL bỏ qua ${key}`,
    );
  }
});
