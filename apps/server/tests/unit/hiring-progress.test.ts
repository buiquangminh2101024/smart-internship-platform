// Chạy: node --import tsx --test tests/unit/hiring-progress.test.ts (từ apps/server)
// 0.3 bước 5a (docs/06-backend/hiring-progress/PLAN.md): thứ tự "cần chú ý", tổng của công
// ty, cắt 5 tin, `scoredAt`, `ownedByViewer`, và EmployerDashboardService.hiringProgress với
// repository giả. SQL của progressForCompany không được kiểm ở đây (đã đối chiếu trên Neon).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHiringProgress,
  compareHiringProgress,
  HIRING_PROGRESS_LIMIT,
} from "../../src/modules/dashboard/hiring-progress.policy";
import { EmployerDashboardService } from "../../src/modules/dashboard/employer-dashboard.service";
import type { HiringProgressRow } from "../../src/modules/match-scores/match-score.repository";

const NOW = new Date("2026-11-11T05:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

function row(id: string, overrides: Partial<HiringProgressRow> = {}): HiringProgressRow {
  return {
    jobPostId: id,
    title: `Tin ${id}`,
    employerId: "emp-1",
    expiresAt: inDays(30),
    hiringTarget: 2,
    autoOutreachEnabled: false,
    matchScoresAt: new Date("2026-11-11T03:50:00.000Z"),
    matched: 10,
    matchedApplied: 2,
    invited: 5,
    acceptedInvitations: 1,
    interviewing: 1,
    hired: 0,
    ...overrides,
  };
}

const order = (rows: HiringProgressRow[]) =>
  [...rows].sort((a, b) => compareHiringProgress(a, b, NOW)).map((r) => r.jobPostId);

test("cần chú ý: tin chưa đạt chỉ tiêu trước tin đã đạt, kể cả khi tin đã đạt sắp hết hạn", () => {
  const met = row("met", { hired: 2, hiringTarget: 2, expiresAt: inDays(1) });
  const open = row("open", { hired: 1, hiringTarget: 2, expiresAt: inDays(60) });
  assert.deepEqual(order([met, open]), ["open", "met"]);
});

test("cần chú ý: trong tin chưa đạt, tin còn ≤ 7 ngày tới hạn trước, dù tỉ lệ đã tuyển cao hơn", () => {
  const soon = row("soon", { hired: 3, hiringTarget: 4, expiresAt: inDays(7) });
  const later = row("later", { hired: 0, hiringTarget: 4, expiresAt: inDays(8) });
  assert.deepEqual(order([later, soon]), ["soon", "later"]);
});

test("cần chú ý: cùng nhóm hạn ⇒ tỉ lệ đã tuyển / chỉ tiêu thấp trước, rồi hạn nộp gần trước", () => {
  const half = row("half", { hired: 1, hiringTarget: 2, expiresAt: inDays(20) });
  const tenth = row("tenth", { hired: 1, hiringTarget: 10, expiresAt: inDays(40) });
  const zeroLate = row("zero-late", { hired: 0, expiresAt: inDays(50) });
  const zeroEarly = row("zero-early", { hired: 0, expiresAt: inDays(10) });
  assert.deepEqual(order([half, tenth, zeroLate, zeroEarly]), ["zero-early", "zero-late", "tenth", "half"]);
});

test("cần chú ý: tin không có hạn nộp đứng sau tin có hạn, không bị coi là sắp hết hạn; hoà thì theo id", () => {
  const noDeadline = row("a-none", { expiresAt: null });
  const deadline = row("z-dated", { expiresAt: inDays(30) });
  const twinA = row("b-none", { expiresAt: null });
  assert.deepEqual(order([noDeadline, deadline, twinA]), ["z-dated", "a-none", "b-none"]);
});

test("buildHiringProgress: tổng tính trên mọi tin, items chỉ 5 tin cần chú ý nhất", () => {
  const rows = Array.from({ length: 7 }, (_, i) =>
    row(`job-${i}`, { matched: i + 1, hired: i < 2 ? 2 : 0, hiringTarget: 2, expiresAt: inDays(10 + i) }),
  );
  const result = buildHiringProgress(rows, "emp-1", NOW);
  assert.deepEqual(result.totals, { publishedJobs: 7, matched: 28, hired: 4, hiringTarget: 14 });
  assert.equal(result.items.length, HIRING_PROGRESS_LIMIT);
  // job-0 và job-1 đã đạt chỉ tiêu ⇒ bị đẩy ra ngoài 5 tin.
  assert.deepEqual(
    result.items.map((item) => item.jobPostId),
    ["job-2", "job-3", "job-4", "job-5", "job-6"],
  );
});

test("buildHiringProgress: scoredAt là lần chấm cũ nhất trong items, bỏ qua tin chưa chấm", () => {
  const rows = [
    row("a", { matchScoresAt: new Date("2026-11-11T03:52:00.000Z") }),
    row("b", { matchScoresAt: null }),
    row("c", { matchScoresAt: new Date("2026-11-10T20:30:00.000Z") }),
  ];
  const result = buildHiringProgress(rows, "emp-1", NOW);
  assert.equal(result.scoredAt, "2026-11-10T20:30:00.000Z");
  assert.equal(result.items.find((item) => item.jobPostId === "b")?.matchScoresAt, null);

  assert.equal(buildHiringProgress([row("x", { matchScoresAt: null })], "emp-1", NOW).scoredAt, null);
  assert.deepEqual(buildHiringProgress([], "emp-1", NOW), {
    totals: { publishedJobs: 0, matched: 0, hired: 0, hiringTarget: 0 },
    items: [],
    scoredAt: null,
  });
});

test("buildHiringProgress: chuyển đúng các trường, ownedByViewer theo người đăng tin, không lộ employerId", () => {
  const mine = row("mine", { employerId: "emp-1", autoOutreachEnabled: true, expiresAt: inDays(3) });
  const theirs = row("theirs", { employerId: "emp-2", expiresAt: null });
  const { items } = buildHiringProgress([mine, theirs], "emp-1", NOW);
  assert.deepEqual(items[0], {
    jobPostId: "mine",
    title: "Tin mine",
    expiresAt: inDays(3).toISOString(),
    matched: 10,
    matchedApplied: 2,
    invited: 5,
    acceptedInvitations: 1,
    interviewing: 1,
    hired: 0,
    hiringTarget: 2,
    autoOutreachEnabled: true,
    ownedByViewer: true,
    matchScoresAt: "2026-11-11T03:50:00.000Z",
  });
  assert.equal(items[1]?.ownedByViewer, false);
  assert.equal(items[1]?.expiresAt, null);
});

test("EmployerDashboardService.hiringProgress: đọc tiến độ theo công ty của người xem, so người đăng tin bằng employerId", async () => {
  const asked: string[] = [];
  const service = new EmployerDashboardService({
    employerIdentityCache: { require: async () => ({ userId: "user-2", employerId: "emp-2", companyId: "co-1" }) },
    matchScoreRepository: {
      progressForCompany: async (companyId: string) => {
        asked.push(companyId);
        return [row("j1", { employerId: "emp-1" }), row("j2", { employerId: "emp-2" })];
      },
    },
  } as unknown as ConstructorParameters<typeof EmployerDashboardService>[0]);

  const result = await service.hiringProgress("user-2", NOW);
  assert.deepEqual(asked, ["co-1"]);
  assert.deepEqual(
    result.items.map((item) => [item.jobPostId, item.ownedByViewer]),
    [
      ["j1", false],
      ["j2", true],
    ],
  );
});
