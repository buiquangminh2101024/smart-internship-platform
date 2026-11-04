// Chạy: node --import tsx --test tests/unit/audit-log-highlights.test.ts (từ apps/server)
// Khối "Điểm chính" (docs/05-frontend/phases/admin-activity-v2/PLAN.md N3–N6): gộp vi
// phạm theo tài khoản (tối đa 10, lần gần nhất trước), quy tắc IP mới của Admin, gộp giờ
// gửi tin dồn dập của Employer, và `GET /admin/activity/highlights` với repository giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activityHighlightsQuerySchema } from "../../src/modules/audit-log/audit-log.dto";
import {
  DANGEROUS_ACTIONS_PER_HOUR,
  DANGEROUS_ADMIN_ACTIONS,
  HIGHLIGHT_ACCOUNT_LIMIT,
  KNOWN_IP_LIMIT,
  SUBMIT_BURST_PER_HOUR,
  findNewIpLogins,
  findReportedJobs,
  groupBurstHours,
  summarizeRule,
  type AdminLoginRow,
  type PendingReportRow,
} from "../../src/modules/audit-log/audit-log.highlights";
import { AuditLogService } from "../../src/modules/audit-log/audit-log.service";

const at = (iso: string) => new Date(iso);
const DAY = 24 * 60 * 60 * 1000;

// ─── summarizeRule ───────────────────────────────────────────────────────

test("summarizeRule: cộng mọi lần, đếm mọi tài khoản, chỉ trả 10 tài khoản có lần gần nhất mới nhất", () => {
  const tallies = Array.from({ length: 12 }, (_, i) => ({
    userId: `u-${String(i).padStart(2, "0")}`,
    count: i + 1,
    latestAt: new Date(Date.UTC(2026, 10, 1) + i * 60_000),
    latestLogId: `log-${i}`,
  }));
  const summary = summarizeRule(tallies);
  assert.equal(summary.count, (12 * 13) / 2);
  assert.equal(summary.accountCount, 12);
  assert.equal(summary.top.length, HIGHLIGHT_ACCOUNT_LIMIT);
  assert.equal(summary.top[0]?.userId, "u-11");
  assert.equal(summary.top[9]?.userId, "u-02");
  // Không đổi thứ tự mảng đầu vào.
  assert.equal(tallies[0]?.userId, "u-00");
});

test("summarizeRule: cùng thời điểm thì xếp theo userId; rỗng thì 0", () => {
  const same = at("2026-11-01T00:00:00Z");
  const summary = summarizeRule([
    { userId: "b", count: 1, latestAt: same, latestLogId: "1" },
    { userId: "a", count: 2, latestAt: same, latestLogId: "2" },
  ]);
  assert.deepEqual(summary.top.map((tally) => tally.userId), ["a", "b"]);
  assert.deepEqual(summarizeRule([]), { count: 0, accountCount: 0, top: [] });
});

// ─── findNewIpLogins (quy tắc b) ─────────────────────────────────────────

const WINDOW = { gte: at("2026-10-29T17:00:00Z"), lt: at("2026-11-05T17:00:00Z") }; // 30/10 – 05/11 giờ VN

function login(id: string, actorId: string, iso: string, ip: string | null): AdminLoginRow {
  return { id, actorId, createdAt: at(iso), ip };
}

test("IP mới: IP đã dùng trong 30 ngày trước thì quen; IP lạ thì báo, kèm tối đa 3 IP quen mới trước", () => {
  const logins = [
    login("l1", "admin-1", "2026-10-05T02:00:00Z", "10.0.0.1"),
    login("l2", "admin-1", "2026-10-20T02:00:00Z", "10.0.0.2"),
    login("l3", "admin-1", "2026-10-25T02:00:00Z", "10.0.0.3"),
    login("l4", "admin-1", "2026-10-28T02:00:00Z", "10.0.0.4"),
    login("l5", "admin-1", "2026-11-01T02:00:00Z", "10.0.0.2"), // quen
    login("l6", "admin-1", "2026-11-03T15:00:00Z", "203.0.113.9"), // lạ
  ];
  const [tally, ...rest] = findNewIpLogins(logins, WINDOW);
  assert.equal(rest.length, 0);
  assert.equal(tally?.count, 1);
  assert.equal(tally?.latestLogId, "l6");
  assert.equal(tally?.ip, "203.0.113.9");
  // Mới trước, không trùng (10.0.0.2 dùng hai lần), cắt còn 3.
  assert.deepEqual(tally?.knownIps, ["10.0.0.2", "10.0.0.4", "10.0.0.3"]);
  assert.equal(tally?.knownIps.length, KNOWN_IP_LIMIT);
});

test("IP mới: IP chỉ dùng hơn 30 ngày trước thì vẫn là mới; không có lần nào trước đó cũng là mới", () => {
  const logins = [
    login("old", "admin-1", "2026-09-25T02:00:00Z", "10.0.0.1"),
    login("back", "admin-1", "2026-11-02T02:00:00Z", "10.0.0.1"), // lần trước cách 38 ngày
    login("first", "admin-2", "2026-11-04T01:00:00Z", "10.9.9.9"),
  ];
  const tallies = findNewIpLogins(logins, WINDOW);
  const byId = new Map(tallies.map((tally) => [tally.userId, tally]));
  assert.equal(byId.get("admin-1")?.latestLogId, "back");
  assert.deepEqual(byId.get("admin-1")?.knownIps, []);
  assert.equal(byId.get("admin-2")?.latestLogId, "first");
});

test("IP mới: chỉ đếm lần trong khoảng; lần trước khoảng chỉ để so; IP mới dùng lại lần sau thì thành quen", () => {
  const logins = [
    login("before", "admin-1", "2026-10-29T10:00:00Z", "198.51.100.1"), // trước khoảng: không đếm
    login("a", "admin-1", "2026-10-31T02:00:00Z", "198.51.100.7"), // mới
    login("b", "admin-1", "2026-11-01T02:00:00Z", "198.51.100.7"), // đã quen nhờ "a"
    login("c", "admin-1", "2026-11-02T02:00:00Z", "198.51.100.8"), // mới
    login("after", "admin-1", "2026-11-06T02:00:00Z", "198.51.100.9"), // sau khoảng
  ];
  const [tally] = findNewIpLogins(logins, WINDOW);
  assert.equal(tally?.count, 2);
  assert.equal(tally?.latestLogId, "c");
  assert.deepEqual(tally?.knownIps, ["198.51.100.7", "198.51.100.1"]);
});

test("IP mới: thứ tự đầu vào không quan trọng; lần không có IP không xét và không làm IP quen", () => {
  const logins = [
    login("y", "admin-1", "2026-11-02T02:00:00Z", "10.0.0.5"),
    login("x", "admin-1", "2026-11-01T02:00:00Z", null),
    login("w", "admin-1", "2026-10-20T02:00:00Z", "10.0.0.5"),
  ];
  assert.deepEqual(findNewIpLogins(logins, WINDOW), []);
  assert.deepEqual(findNewIpLogins([login("n", "admin-1", "2026-11-02T02:00:00Z", null)], WINDOW), []);
});

// ─── groupBurstHours (quy tắc c) ─────────────────────────────────────────

test("gửi tin dồn dập: gộp theo tài khoản, số giờ, nhiều nhất mỗi giờ, giờ gần nhất làm since/until", () => {
  const hour = (iso: string, count: number, userId = "emp-1") => ({
    userId,
    hourStart: at(iso),
    count,
    latestAt: new Date(at(iso).getTime() + 50 * 60_000),
    latestLogId: `${userId}-${iso}`,
  });
  const tallies = groupBurstHours([
    hour("2026-11-01T20:00:00Z", 24), // 03:00 02/11 giờ VN
    hour("2026-11-03T02:00:00Z", 11),
    hour("2026-10-31T07:00:00Z", 12),
    hour("2026-10-30T02:00:00Z", 10, "emp-2"),
  ]);
  const emp1 = tallies.find((tally) => tally.userId === "emp-1");
  assert.equal(tallies.length, 2);
  assert.equal(emp1?.count, 3);
  assert.equal(emp1?.maxPerHour, 24);
  assert.deepEqual(emp1?.latestHour, {
    since: at("2026-11-03T02:00:00Z"),
    until: at("2026-11-03T02:59:59.999Z"),
    count: 11,
  });
  assert.equal(emp1?.latestLogId, "emp-1-2026-11-03T02:00:00Z");
  assert.equal(emp1?.latestAt.toISOString(), "2026-11-03T02:50:00.000Z");
});

// ─── findReportedJobs (quy tắc e) ────────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const WEEK = { gte: at("2026-10-28T17:00:00Z"), lt: at("2026-11-04T17:00:00Z") };
const report = (id: string, jobId: string, reporterId: string, iso: string): PendingReportRow => ({
  id,
  jobId,
  reporterId,
  createdAt: at(iso),
});

test("tin bị báo cáo: đúng 3 người trong 24 giờ (tính cả mốc 24 giờ) thì báo; cách 24 giờ 1 phút thì không", () => {
  const exact = [
    report("a1", "job-a", "c1", "2026-11-01T00:00:00Z"),
    report("a2", "job-a", "c2", "2026-11-01T10:00:00Z"),
    report("a3", "job-a", "c3", "2026-11-02T00:00:00Z"),
  ];
  const late = [
    report("b1", "job-b", "c1", "2026-11-01T00:00:00Z"),
    report("b2", "job-b", "c2", "2026-11-01T10:00:00Z"),
    report("b3", "job-b", "c3", "2026-11-02T00:01:00Z"),
  ];
  const result = findReportedJobs([...late, ...exact], WEEK);
  assert.deepEqual(result, [
    {
      jobId: "job-a",
      pendingReports: 3,
      crossedAt: at("2026-11-02T00:00:00Z"),
      oldestPendingAt: at("2026-11-01T00:00:00Z"),
      oldestPendingReportId: "a1",
    },
  ]);
});

test("tin bị báo cáo: một người báo hai lần chỉ tính một; còn 2 báo cáo chờ thì không báo", () => {
  const twoPeople = [
    report("a1", "job-a", "c1", "2026-11-01T00:00:00Z"),
    report("a2", "job-a", "c1", "2026-11-01T01:00:00Z"),
    report("a3", "job-a", "c2", "2026-11-01T02:00:00Z"),
  ];
  assert.deepEqual(findReportedJobs(twoPeople, WEEK), []);
  // Người thứ ba tới: đủ 3 người, báo cáo trùng vẫn nằm trong số báo cáo đang chờ.
  const result = findReportedJobs([...twoPeople, report("a4", "job-a", "c3", "2026-11-01T03:00:00Z")], WEEK);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.pendingReports, 4);
  assert.deepEqual(result[0]?.crossedAt, at("2026-11-01T03:00:00Z"));
  assert.deepEqual(findReportedJobs(twoPeople.slice(0, 2), WEEK), []);
});

test("tin bị báo cáo: lấy lần đầu đạt ngưỡng theo cửa sổ trượt; đạt trước khoảng thì không tính", () => {
  // Ba báo cáo đầu rải 3 ngày; báo cáo 2–4 trong 24 giờ ⇒ vượt ngưỡng ở báo cáo thứ tư.
  const sliding = [
    report("a1", "job-a", "c1", "2026-10-29T00:00:00Z"),
    report("a2", "job-a", "c2", "2026-10-31T13:00:00Z"),
    report("a3", "job-a", "c3", "2026-11-01T00:00:00Z"),
    report("a4", "job-a", "c4", "2026-11-01T12:00:00Z"),
  ];
  // Đạt ngưỡng ngày 20/10 (trước khoảng 7 ngày), thêm báo cáo trong khoảng cũng không đổi.
  const before = [
    report("b1", "job-b", "c1", "2026-10-20T00:00:00Z"),
    report("b2", "job-b", "c2", "2026-10-20T01:00:00Z"),
    report("b3", "job-b", "c3", "2026-10-20T02:00:00Z"),
    report("b4", "job-b", "c4", "2026-11-03T00:00:00Z"),
  ];
  const result = findReportedJobs([...before, ...sliding], WEEK);
  assert.deepEqual(result.map((job) => [job.jobId, job.crossedAt.toISOString(), job.oldestPendingReportId]), [
    ["job-a", "2026-11-01T12:00:00.000Z", "a1"],
  ]);
  const month = { gte: new Date(WEEK.lt.getTime() - 30 * DAY), lt: WEEK.lt };
  assert.deepEqual(findReportedJobs(before, month).map((job) => job.jobId), ["job-b"]);
});

test("tin bị báo cáo: tin vượt ngưỡng gần nhất đứng trước; thứ tự đầu vào không quan trọng", () => {
  const rows = ["job-x", "job-y", "job-z"].flatMap((jobId, j) =>
    ["c1", "c2", "c3"].map((reporterId, i) =>
      report(`${jobId}-${i}`, jobId, reporterId, new Date(Date.UTC(2026, 10, 1 + j) + i * HOUR).toISOString()),
    ),
  );
  assert.deepEqual(findReportedJobs([...rows].reverse(), WEEK).map((job) => job.jobId), ["job-z", "job-y", "job-x"]);
});

// ─── GET /admin/activity/highlights ──────────────────────────────────────

test("DTO highlights: mặc định 7, nhận 30, từ chối giá trị khác", () => {
  assert.equal(activityHighlightsQuerySchema.parse({}).days, 7);
  assert.equal(activityHighlightsQuerySchema.parse({ days: "30" }).days, 30);
  assert.equal(activityHighlightsQuerySchema.safeParse({ days: "14" }).success, false);
});

const NOW = at("2026-11-04T10:00:00Z"); // 17:00 04/11 giờ VN

function buildService(options: { archivedUntil?: Date | null } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    <T>(method: string, result: T) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };
  const auditLogRepository = {
    countByAction: record(
      "countByAction",
      new Map([
        ["JOB_POST_APPROVED", 12],
        ["JOB_POST_AUTO_PUBLISHED", 2],
        ["JOB_POST_REJECTED", 3],
        ["COMPANY_VERIFIED", 3],
        ["COMPANY_AUTO_VERIFIED", 1],
        ["COMPANY_REJECTED", 1],
        ["PAYMENT_COMPLETED", 5],
        ["CATALOG_ENTRY_APPROVED", 3],
        ["CATALOG_ENTRY_RENAME_APPROVED", 1],
        ["CATALOG_ENTRY_MERGED", 1],
        ["JOB_REPORT_ACTION_EXECUTED", 2],
        ["JOB_REPORT_RESOLVED", 3],
      ]),
    ),
    count: record("count", 2),
    tallyFailedLoginAlerts: record("tallyFailedLoginAlerts", [
      { userId: "cand-1", count: 2, latestAt: at("2026-11-03T15:14:00Z"), latestLogId: "f2" },
      { userId: "emp-9", count: 1, latestAt: at("2026-10-30T01:00:00Z"), latestLogId: "f1" },
    ]),
    findLatestArchivedAt: record("findLatestArchivedAt", options.archivedUntil ?? null),
    findAdminLogins: async (range: unknown, archived = false) => {
      calls.push({ method: "findAdminLogins", args: [range, archived] });
      if (archived) return [{ id: "z0", actorId: "admin-1", createdAt: at("2026-10-01T02:00:00Z"), metadata: { ip: "10.0.0.9" } }];
      return [
        { id: "z1", actorId: "admin-1", createdAt: at("2026-10-20T02:00:00Z"), metadata: { ip: "10.0.0.1" } },
        { id: "z2", actorId: "admin-1", createdAt: at("2026-11-03T02:00:00Z"), metadata: { ip: "203.0.113.5" } },
        { id: "z3", actorId: "admin-1", createdAt: at("2026-11-04T02:00:00Z"), metadata: { ip: "10.0.0.1" } },
        { id: "z4", actorId: null, createdAt: at("2026-11-04T03:00:00Z"), metadata: { ip: "1.1.1.1" } },
      ];
    },
    findSubmitBurstHours: record("findSubmitBurstHours", [
      { userId: "emp-1", hourStart: at("2026-11-01T20:00:00Z"), count: 24, latestAt: at("2026-11-01T20:55:00Z"), latestLogId: "s1" },
    ]),
    findAdminDangerBurstHours: record("findAdminDangerBurstHours", [
      { userId: "admin-1", hourStart: at("2026-10-31T14:00:00Z"), count: 6, latestAt: at("2026-10-31T14:48:00Z"), latestLogId: "d1" },
    ]),
    // job-a vượt ngưỡng 02/11 (trong khoảng); job-b có 3 báo cáo nhưng rải quá 24 giờ.
    findPendingJobReports: record("findPendingJobReports", [
      { id: "r1", jobId: "job-a", reporterId: "c1", createdAt: at("2026-11-02T01:00:00Z") },
      { id: "r2", jobId: "job-a", reporterId: "c2", createdAt: at("2026-11-02T03:00:00Z") },
      { id: "r3", jobId: "job-a", reporterId: "c3", createdAt: at("2026-11-02T05:30:00Z") },
      { id: "r4", jobId: "job-b", reporterId: "c1", createdAt: at("2026-10-30T01:00:00Z") },
      { id: "r5", jobId: "job-b", reporterId: "c2", createdAt: at("2026-11-01T01:00:00Z") },
      { id: "r6", jobId: "job-b", reporterId: "c3", createdAt: at("2026-11-03T01:00:00Z") },
    ]),
    findJobTitles: record(
      "findJobTitles",
      new Map([["job-a", { title: "Thực tập sinh QA", companyName: "TechViet" }]]),
    ),
  };
  const service = new AuditLogService({
    auditLogRepository,
    userRepository: {
      findEmailsByIds: record(
        "findEmailsByIds",
        new Map([
          ["cand-1", "an@sv.edu.vn"],
          ["admin-1", "admin@sip.vn"],
          ["emp-1", "hr@techviet.vn"],
        ]),
      ),
    },
    companySubscriptionRepository: {},
    rateLimiter: {},
    logger: { error: () => {} },
  } as unknown as ConstructorParameters<typeof AuditLogService>[0]);
  return { service, calls };
}

test("highlights 7 ngày: khoảng tới hôm nay giờ VN, đủ ba quy tắc và bốn dòng hoạt động chính", async () => {
  const { service, calls } = buildService();
  const result = await service.getHighlights(activityHighlightsQuerySchema.parse({}), NOW);

  assert.equal(result.days, 7);
  assert.equal(result.from, "2026-10-29");
  assert.equal(result.to, "2026-11-04");
  const range = { gte: at("2026-10-28T17:00:00Z"), lt: at("2026-11-04T17:00:00Z") };
  assert.deepEqual(calls.find((call) => call.method === "tallyFailedLoginAlerts")?.args, [range]);
  assert.deepEqual(calls.find((call) => call.method === "findSubmitBurstHours")?.args, [
    range,
    ["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"],
    SUBMIT_BURST_PER_HOUR,
  ]);
  // (b) lùi thêm 30 ngày để so IP; bảng lưu trữ rỗng thì không đọc.
  const loginCalls = calls.filter((call) => call.method === "findAdminLogins");
  assert.deepEqual(loginCalls.map((call) => call.args), [[{ gte: new Date(range.gte.getTime() - 30 * DAY), lt: range.lt }, false]]);

  assert.deepEqual(result.thresholds, {
    failedLoginAttempts: 5,
    failedLoginWindowMinutes: 15,
    newIpLookbackDays: 30,
    submitBurstPerHour: 10,
    dangerousActionsPerHour: 5,
    reportedJobMinReports: 3,
    reportedJobWindowHours: 24,
  });

  const { failedLogins, adminNewIp, employerSubmitBurst } = result.attention;
  assert.equal(failedLogins.count, 3);
  assert.equal(failedLogins.accountCount, 2);
  assert.deepEqual(failedLogins.accounts[0], {
    userId: "cand-1",
    email: "an@sv.edu.vn",
    count: 2,
    latestAt: "2026-11-03T15:14:00.000Z",
    latestLogId: "f2",
  });
  assert.equal(failedLogins.accounts[1]?.email, null);

  // z2 lạ (chỉ quen 10.0.0.1); z3 quen; dòng không có người làm bị bỏ.
  assert.deepEqual(adminNewIp, {
    count: 1,
    accountCount: 1,
    accounts: [
      {
        userId: "admin-1",
        email: "admin@sip.vn",
        count: 1,
        latestAt: "2026-11-03T02:00:00.000Z",
        latestLogId: "z2",
        ip: "203.0.113.5",
        knownIps: ["10.0.0.1"],
      },
    ],
  });

  assert.deepEqual(employerSubmitBurst.accounts[0]?.latestHour, {
    since: "2026-11-01T20:00:00.000Z",
    until: "2026-11-01T20:59:59.999Z",
    count: 24,
  });
  assert.equal(employerSubmitBurst.accounts[0]?.maxPerHour, 24);

  assert.deepEqual(result.activity, {
    jobPosts: { approved: 14, rejected: 3, resubmitted: 2 },
    companies: { verified: 4, rejected: 1 },
    payments: { completed: 5 },
    catalog: { approved: 4, rejected: 0, merged: 1 },
    jobReports: { takenDown: 2, dismissed: 3 },
  });

  // (d) cùng khoảng, năm action nguy hiểm, tắt kiểm duyệt mới tính, ngưỡng 5.
  assert.deepEqual(calls.find((call) => call.method === "findAdminDangerBurstHours")?.args, [
    range,
    DANGEROUS_ADMIN_ACTIONS,
    "COMPANY_REQUIRES_APPROVAL_CHANGED",
    DANGEROUS_ACTIONS_PER_HOUR,
  ]);
  assert.deepEqual(result.attention.adminDangerBurst, {
    count: 1,
    accountCount: 1,
    accounts: [
      {
        userId: "admin-1",
        email: "admin@sip.vn",
        count: 1,
        latestAt: "2026-10-31T14:48:00.000Z",
        latestLogId: "d1",
        maxPerHour: 6,
        latestHour: { since: "2026-10-31T14:00:00.000Z", until: "2026-10-31T14:59:59.999Z", count: 6 },
      },
    ],
  });

  // (e) chỉ job-a; tên tin chỉ tra cho tin hiện ra.
  assert.deepEqual(result.attention.reportedJobs, {
    count: 1,
    items: [
      {
        jobId: "job-a",
        title: "Thực tập sinh QA",
        companyName: "TechViet",
        pendingReports: 3,
        crossedAt: "2026-11-02T05:30:00.000Z",
        oldestPendingAt: "2026-11-02T01:00:00.000Z",
        oldestPendingReportId: "r1",
      },
    ],
  });
  assert.deepEqual(calls.find((call) => call.method === "findJobTitles")?.args, [["job-a"]]);
  // "Gửi lại" đếm hai hành động gửi có cờ resubmit trong cùng khoảng.
  assert.deepEqual(calls.find((call) => call.method === "count")?.args, [
    {
      AND: [
        { action: { in: ["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"] } },
        { metadata: { path: ["resubmit"], equals: true } },
        { createdAt: { gte: range.gte, lt: range.lt } },
      ],
    },
  ]);
  // Một lần tra email cho mọi tài khoản hiện ra.
  const emailCalls = calls.filter((call) => call.method === "findEmailsByIds");
  assert.equal(emailCalls.length, 1);
  assert.deepEqual([...(emailCalls[0]?.args[0] as string[])].sort(), ["admin-1", "cand-1", "emp-1", "emp-9"]);
});

test("highlights 30 ngày: khoảng 30 ngày; phần lùi so IP lấn qua mốc lưu trữ thì đọc cả bảng lưu trữ", async () => {
  const { service, calls } = buildService({ archivedUntil: at("2026-09-10T00:00:00Z") });
  const result = await service.getHighlights(activityHighlightsQuerySchema.parse({ days: "30" }), NOW);
  assert.equal(result.from, "2026-10-06");
  assert.equal(result.to, "2026-11-04");
  const loginCalls = calls.filter((call) => call.method === "findAdminLogins");
  assert.deepEqual(loginCalls.map((call) => call.args[1]), [false, true]);
  // z0 (01/10, bảng lưu trữ) trước khoảng: không đếm, chỉ để so. z1 (20/10, 10.0.0.1) chỉ quen
  // 10.0.0.9 ⇒ mới. z2 (03/11) chỉ quen 10.0.0.1 (z0 đã cách 33 ngày) ⇒ mới. Tổng 2 lần.
  assert.equal(result.attention.adminNewIp.count, 2);
  assert.equal(result.attention.adminNewIp.accounts[0]?.latestLogId, "z2");
  assert.deepEqual(result.attention.adminNewIp.accounts[0]?.knownIps, ["10.0.0.1"]);
});
