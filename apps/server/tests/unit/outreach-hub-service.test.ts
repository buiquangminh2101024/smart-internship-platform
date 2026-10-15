// Chạy: node --import tsx --test tests/unit/outreach-hub-service.test.ts (từ apps/server)
// Trang "Lời mời" cấp công ty (docs/06-backend/outreach-hub/PLAN.md): thứ tự tin (Q3),
// bộ lọc chuyển đúng xuống repository, tin / cursor của công ty khác bị chặn, phân
// trang lấy dư 1 dòng, cờ sentByMe và trạng thái hiển thị (H4). Repository là bản giả;
// SQL (EFFECTIVE_STATUS) được đối chiếu riêng trên DB thật.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { OutreachJobSummary } from "@sip/shared-types";
import { listCompanyInvitationsQuerySchema } from "../../src/modules/candidate-outreach/candidate-outreach.dto";
import type {
  CompanyInvitationFilter,
  InvitationWithRelations,
} from "../../src/modules/candidate-outreach/candidate-outreach.repository";
import { CandidateOutreachService, compareOutreachJobs } from "../../src/modules/candidate-outreach/candidate-outreach.service";

const ME = { id: "emp-me", companyId: "co-1", company: { id: "co-1", name: "Công ty A", verifiedAt: new Date() } };
const FUTURE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

function invitation(
  id: string,
  overrides: { employerId?: string; status?: InvitationWithRelations["status"]; expiresAt?: Date; jobStatus?: InvitationWithRelations["jobPost"]["status"] } = {},
): InvitationWithRelations {
  const employerId = overrides.employerId ?? ME.id;
  return {
    id,
    companyId: ME.companyId,
    employerId,
    jobPostId: "job-1",
    candidateId: `cand-${id}`,
    status: overrides.status ?? "PENDING",
    createdAt: new Date("2026-10-10T03:00:00Z"),
    expiresAt: overrides.expiresAt ?? FUTURE,
    respondedAt: null,
    matchScore: 80,
    matchWeightsVersion: "hybrid-v1",
    jobPost: { id: "job-1", title: "Thực tập sinh Frontend", status: overrides.jobStatus ?? "PUBLISHED" },
    company: { id: ME.companyId, name: ME.company.name, logoUrl: null },
    employer: { id: employerId, userId: `user-${employerId}` },
    candidate: { id: `cand-${id}`, userId: `user-cand-${id}`, fullName: `Ứng viên ${id}` },
  };
}

function buildService(rows: InvitationWithRelations[] = []) {
  const calls: { filter?: CompanyInvitationFilter; take?: number } = {};
  const candidateOutreachRepository = {
    findEmployerByUserId: async () => ME,
    findJobPost: async (id: string) =>
      id === "job-other-co"
        ? { id, title: "Tin công ty khác", status: "PUBLISHED", employerId: "emp-x", companyId: "co-2" }
        : { id, title: "Tin của công ty", status: "CLOSED", employerId: "emp-colleague", companyId: ME.companyId },
    isCompanyInvitation: async (_companyId: string, id: string) => rows.some((row) => row.id === id),
    listCompanyInvitationIds: async (_companyId: string, filter: CompanyInvitationFilter, take: number) => {
      calls.filter = filter;
      calls.take = take;
      return rows.map((row) => row.id).slice(0, take);
    },
    findManyByIds: async (ids: string[]) => ids.map((id) => rows.find((row) => row.id === id)!),
    findSearchCards: async () => [],
    findProfileAccessibleCandidateIds: async (_companyId: string, ids: string[]) => new Set(ids.slice(0, 1)),
    countLast30Days: async () => ({ total: 7, pending: 2, accepted: 3, declined: 1, expired: 1 }),
    countByJobPost: async () => new Map([["job-mine-late", { total: 4, pending: 1, accepted: 2, declined: 1, expired: 0 }]]),
    findOutreachJobs: async () => [
      { id: "job-closed", title: "Tin đã đóng", status: "CLOSED", expiresAt: null, employerId: ME.id },
      { id: "job-colleague", title: "Tin đồng nghiệp", status: "PUBLISHED", expiresAt: new Date("2026-10-20T00:00:00Z"), employerId: "emp-colleague" },
      { id: "job-mine-none", title: "Tin không hạn", status: "PUBLISHED", expiresAt: null, employerId: ME.id },
      { id: "job-mine-late", title: "Tin hạn xa", status: "PUBLISHED", expiresAt: new Date("2026-11-30T00:00:00Z"), employerId: ME.id },
      { id: "job-mine-soon", title: "Tin hạn gần", status: "PUBLISHED", expiresAt: new Date("2026-10-18T00:00:00Z"), employerId: ME.id },
    ],
  };
  const service = new CandidateOutreachService({
    candidateOutreachRepository,
    subscriptionsService: { getCompanySubscriptionAccess: async () => ({ mode: "BLOCKED" }) },
    config: { JOB_MATCHER_MODE: "rule" },
  } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);
  return { service, calls };
}

const query = (raw: Record<string, string> = {}) => listCompanyInvitationsQuerySchema.parse(raw);

test("summary: tin PUBLISHED của mình trước, theo hạn gần nhất; tin đồng nghiệp sau; tin đã đóng cuối", async () => {
  const summary = await buildService().service.getCompanySummary("user-me");
  assert.deepEqual(
    summary.jobs.map((job) => [job.jobPostId, job.isOwner]),
    [
      ["job-mine-soon", true],
      ["job-mine-late", true],
      ["job-mine-none", true],
      ["job-colleague", false],
      ["job-closed", true],
    ],
  );
  assert.deepEqual(summary.jobs[1]!.invitations, { total: 4, pending: 1, accepted: 2, declined: 1, expired: 0 });
  assert.deepEqual(summary.jobs[0]!.invitations, { total: 0, pending: 0, accepted: 0, declined: 0, expired: 0 });
  assert.deepEqual(summary.last30Days, { sent: 7, accepted: 3, declined: 1, pending: 2 });
  assert.deepEqual(summary.quota, { mode: "BLOCKED" });
});

test("compareOutreachJobs: tin không PUBLISHED xếp theo tên", () => {
  const job = (jobPostId: string, title: string): OutreachJobSummary => ({
    jobPostId,
    title,
    status: "EXPIRED",
    expiresAt: null,
    isOwner: false,
    invitations: { total: 0, pending: 0, accepted: 0, declined: 0, expired: 0 },
  });
  assert.deepEqual(
    [job("b", "Thực tập sinh QA"), job("a", "Thực tập sinh Backend")].sort(compareOutreachJobs).map((j) => j.jobPostId),
    ["a", "b"],
  );
});

test("query: mặc định cả công ty, 20 dòng; limit ngoài 1–50 và trạng thái lạ bị từ chối", () => {
  assert.deepEqual(query(), { mine: false, limit: 20 });
  assert.equal(query({ mine: "true", limit: "50" }).mine, true);
  assert.equal(listCompanyInvitationsQuerySchema.safeParse({ limit: "51" }).success, false);
  assert.equal(listCompanyInvitationsQuerySchema.safeParse({ limit: "0" }).success, false);
  assert.equal(listCompanyInvitationsQuerySchema.safeParse({ status: "SCORED" }).success, false);
});

test("list: bộ lọc chuyển xuống repository, mine ⇒ employerId của người xem, lấy dư 1 dòng", async () => {
  const { service, calls } = buildService();
  await service.listCompanyInvitations("user-me", query({ status: "EXPIRED", jobPostId: "job-1", mine: "true", limit: "5" }));
  assert.deepEqual(calls.filter, { status: "EXPIRED", jobPostId: "job-1", employerId: ME.id, afterId: undefined });
  assert.equal(calls.take, 6);

  await service.listCompanyInvitations("user-me", query());
  assert.equal(calls.filter?.employerId, undefined);
});

test("list: tin của công ty khác ⇒ 404; tin đã đóng của đồng nghiệp vẫn lọc được", async () => {
  const { service } = buildService();
  await assert.rejects(service.listCompanyInvitations("user-me", query({ jobPostId: "job-other-co" })), { statusCode: 404 });
  const page = await service.listCompanyInvitations("user-me", query({ jobPostId: "job-colleague-closed" }));
  assert.deepEqual(page, { items: [], hasMore: false });
});

test("list: cursor không thuộc công ty ⇒ 400", async () => {
  const { service } = buildService([invitation("i-1")]);
  await assert.rejects(service.listCompanyInvitations("user-me", query({ cursor: "i-other" })), { statusCode: 400 });
});

test("list: còn trang sau ⇒ nextCursor là id dòng cuối của trang; hết thì không có nextCursor", async () => {
  const rows = [invitation("i-3"), invitation("i-2"), invitation("i-1")];
  const { service } = buildService(rows);

  const first = await service.listCompanyInvitations("user-me", query({ limit: "2" }));
  assert.deepEqual(first.items.map((item) => item.invitationId), ["i-3", "i-2"]);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, "i-2");

  const all = await service.listCompanyInvitations("user-me", query({ limit: "3" }));
  assert.equal(all.hasMore, false);
  assert.equal("nextCursor" in all, false);
});

test("list: sentByMe theo người gửi; PENDING quá hạn hoặc tin đã đóng hiện EXPIRED; kèm tin và canViewProfile", async () => {
  const rows = [
    invitation("i-mine"),
    invitation("i-colleague", { employerId: "emp-colleague" }),
    invitation("i-overdue", { expiresAt: PAST }),
    invitation("i-closed-job", { jobStatus: "CLOSED" }),
    invitation("i-accepted", { status: "ACCEPTED", jobStatus: "CLOSED" }),
  ];
  const { items } = await buildService(rows).service.listCompanyInvitations("user-me", query());
  assert.deepEqual(
    items.map((item) => [item.invitationId, item.sentByMe, item.status]),
    [
      ["i-mine", true, "PENDING"],
      ["i-colleague", false, "PENDING"],
      ["i-overdue", true, "EXPIRED"],
      ["i-closed-job", true, "EXPIRED"],
      ["i-accepted", true, "ACCEPTED"],
    ],
  );
  assert.deepEqual(items[0]!.jobPost, { id: "job-1", title: "Thực tập sinh Frontend", status: "PUBLISHED" });
  assert.deepEqual(
    items.map((item) => item.canViewProfile),
    [true, false, false, false, false],
  );
  // Không có thẻ ⇒ dùng tên lưu trong lời mời, không có liên hệ (D2).
  assert.equal(items[0]!.fullName, "Ứng viên i-mine");
  assert.equal("email" in items[0]!, false);
});
