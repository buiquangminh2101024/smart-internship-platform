// Chạy: node --import tsx --test tests/unit/demo-data/large-demo-history.test.ts (từ apps/server)
// Bộ sinh dữ liệu demo lớn, phần 2b — lịch sử (docs/06-backend/large-demo-data/PLAN.md, bước 2):
// chạy trên thư viện thật + kết quả phần 2a với danh mục giả cấp id cho mọi tên.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ApplicationStatus } from "@prisma/client";
import { canTransition } from "../../../src/modules/applications/applications.service";
import {
  catalogAdditionsSchema, companiesFileSchema, jobTemplatesFileSchema, namesFileSchema, personasFileSchema,
  positionsFileSchema, showcaseFileSchema, type LargeDemoLibrary,
} from "../../../scripts/lib/large-demo/library";
import { LARGE_DEMO_ID_PREFIX, generateLargeDemo, type GenerateCatalog, type GenerateOptions, type GeneratedLargeDemo } from "../../../scripts/lib/large-demo/generate";
import { HISTORY_DAILY_INVITATION_CAP, generateLargeDemoHistory, type GeneratedHistory } from "../../../scripts/lib/large-demo/history";

const DATA_DIR = path.join(__dirname, "..", "..", "..", "scripts", "data", "large-demo");
const read = (file: string): unknown => JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));

const LIBRARY: LargeDemoLibrary = {
  positions: positionsFileSchema.parse(read("positions.json")),
  catalogAdditions: catalogAdditionsSchema.parse(read("catalog-additions.json")),
  names: namesFileSchema.parse(read("names.json")),
  companies: companiesFileSchema.parse(read("companies.json")),
  jobTemplates: jobTemplatesFileSchema.parse(read("job-templates.json")),
  personas: personasFileSchema.parse(read("personas.json")),
  showcase: showcaseFileSchema.parse(read("showcase.json")),
};

class AutoIds extends Map<string, string> {
  constructor(private readonly kind: string) {
    super();
  }
  override get(name: string): string | undefined {
    if (!super.has(name)) super.set(name, `${this.kind}${super.size}`);
    return super.get(name);
  }
}
const catalog = (): GenerateCatalog => ({
  skillIds: new AutoIds("skill"), majorIds: new AutoIds("major"), universityIds: new AutoIds("uni"),
  cityIds: new AutoIds("city"), industryIds: new AutoIds("industry"), companyTypeIds: new AutoIds("type"),
});

const NOW = new Date("2026-11-09T03:00:00Z");
const NOW_MS = NOW.getTime();
const DAY = 24 * 60 * 60 * 1000;
const OPTIONS: GenerateOptions = {
  seed: 20261109, scale: 1, now: NOW, passwordHash: "hash", cvFileUrl: "https://example.test/cv.pdf", planId: "plan", adminUserId: "admin",
};

interface Run { demo: GeneratedLargeDemo; history: GeneratedHistory }
let fullRun: Run | undefined;
function full(): Run {
  if (!fullRun) {
    const demo = generateLargeDemo(LIBRARY, catalog(), OPTIONS);
    fullRun = { demo, history: generateLargeDemoHistory(demo, { seed: OPTIONS.seed, now: NOW }) };
  }
  return fullRun;
}
const ms = (value: Date | string | null | undefined) => (value instanceof Date ? value.getTime() : new Date(value!).getTime());
const index = <T, K>(items: readonly T[], key: (item: T) => K) => new Map(items.map((item) => [key(item), item]));
function lookup(run: Run) {
  const { demo } = run;
  return {
    job: index(demo.facts.jobs, (j) => j.id),
    candidate: index(demo.facts.candidates, (c) => c.id),
    cv: index(demo.cvs, (cv) => cv.id!),
    jobWindowEnd: (jobId: string) => {
      const job = demo.facts.jobs.find((j) => j.id === jobId)!;
      return Math.min(job.closedAt?.getTime() ?? Infinity, job.expiresAt?.getTime() ?? Infinity, NOW_MS);
    },
  };
}

test("lịch sử: cùng đầu vào → cùng kết quả", () => {
  const demo = generateLargeDemo(LIBRARY, catalog(), { ...OPTIONS, scale: 0.1 });
  const first = generateLargeDemoHistory(demo, { seed: OPTIONS.seed, now: NOW });
  const second = generateLargeDemoHistory(demo, { seed: OPTIONS.seed, now: NOW });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.ok(first.applications.length > 0 && first.invitations.length > 0);
});

test("lịch sử: quy mô đủ nằm trong khoảng PLAN", () => {
  const { history } = full();
  const within = (label: string, value: number, min: number, max: number) =>
    assert.ok(value >= min && value <= max, `${label} = ${value}, cần ${min}–${max}`);
  within("đơn ứng tuyển", history.applications.length, 4000, 5000);
  within("lịch phỏng vấn", history.interviews.length, 220, 420);
  within("lời mời", history.invitations.length, 220, 420);
  within("hội thoại", history.conversations.length, 300, 550);
  within("tin đã lưu", history.savedJobs.length, 2500, 4000);
  within("thông báo", history.notifications.length, 10, 60);
});

test("lịch sử: id có tiền tố, không trùng; cặp duy nhất theo ràng buộc unique", () => {
  const { history } = full();
  const ids = Object.values(history).flatMap((rows: { id?: string }[]) => rows.map((row) => row.id!));
  assert.ok(ids.every((id) => id.startsWith(LARGE_DEMO_ID_PREFIX) && /^[0-9a-z]+$/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
  const unique = (label: string, keys: string[]) => assert.equal(new Set(keys).size, keys.length, `${label} bị trùng`);
  unique("đơn (tin, ứng viên)", history.applications.map((a) => `${a.jobPostId}|${a.candidateId}`));
  unique("tin đã lưu", history.savedJobs.map((s) => `${s.candidateId}|${s.jobPostId}`));
  unique("hội thoại", history.conversations.map((c) => `${c.candidateId}|${c.employerId}|${c.jobPostId}`));
  unique("lời mời", history.invitations.map((i) => `${i.candidateId}|${i.jobPostId}`));
});

test("đơn ứng tuyển: đúng CV, nộp trong lúc tin hiển thị, không vào tin chính của chính hồ sơ trưng bày", () => {
  const run = full();
  const { job, candidate, cv, jobWindowEnd } = lookup(run);
  for (const app of run.history.applications) {
    const c = candidate.get(app.candidateId)!;
    const j = job.get(app.jobPostId)!;
    assert.equal(app.cvId, c.cvId, `${app.id}: CV không phải của ứng viên`);
    assert.notEqual(c.showcaseJobId, j.id, `${app.id}: hồ sơ trưng bày nộp vào tin chính của mình`);
    assert.ok(j.publishedAt !== null, `${app.id}: tin chưa từng hiển thị`);
    const at = ms(app.createdAt);
    assert.ok(at >= j.publishedAt!.getTime() && at <= jobWindowEnd(j.id), `${app.id}: nộp ngoài thời gian tin hiển thị`);
    assert.ok(at > ms(cv.get(app.cvId)!.uploadedAt), `${app.id}: nộp trước khi tải CV`);
  }
});

test("đơn ứng tuyển: phần lớn nộp đúng vị trí của mình, vẫn có người nộp lệch", () => {
  const run = full();
  const { job, candidate } = lookup(run);
  const samePosition = run.history.applications.filter((a) => job.get(a.jobPostId)!.position === candidate.get(a.candidateId)!.position).length;
  const share = samePosition / run.history.applications.length;
  assert.ok(share > 0.45 && share < 0.95, `tỉ lệ nộp đúng vị trí ${share.toFixed(2)}`);
});

test("lịch sử trạng thái: chuỗi hợp lệ theo applications.service, thời gian tăng dần, khớp trạng thái đơn", () => {
  const run = full();
  const { job, candidate } = lookup(run);
  const byApp = new Map<string, typeof run.history.statusHistory>();
  for (const row of run.history.statusHistory) {
    if (!byApp.has(row.applicationId)) byApp.set(row.applicationId, []);
    byApp.get(row.applicationId)!.push(row);
  }
  for (const app of run.history.applications) {
    const rows = byApp.get(app.id!)!;
    const employerUserId = job.get(app.jobPostId)!.employerUserId;
    const candidateUserId = candidate.get(app.candidateId)!.userId;
    assert.equal(rows[0]!.fromStatus, null);
    assert.equal(rows[0]!.toStatus, "PENDING");
    assert.equal(rows[0]!.actorId, candidateUserId);
    assert.equal(ms(rows[0]!.createdAt), ms(app.createdAt));
    for (let i = 1; i < rows.length; i++) {
      const from = rows[i]!.fromStatus as ApplicationStatus;
      const to = rows[i]!.toStatus as ApplicationStatus;
      assert.equal(from, rows[i - 1]!.toStatus, `${app.id}: fromStatus không nối tiếp`);
      const cancel = from === "PENDING" && to === "CANCELLED";
      assert.ok(canTransition(from, to) || cancel, `${app.id}: ${from} → ${to} không hợp lệ`);
      assert.equal(rows[i]!.actorId, cancel ? candidateUserId : employerUserId);
      assert.ok(ms(rows[i]!.createdAt) > ms(rows[i - 1]!.createdAt), `${app.id}: thời gian không tăng`);
    }
    const last = rows[rows.length - 1]!;
    assert.equal(last.toStatus, app.status);
    assert.equal(ms(last.createdAt), ms(app.updatedAt));
    assert.ok(ms(last.createdAt) < NOW_MS);
  }
  const statuses = new Set(run.history.applications.map((a) => a.status));
  for (const status of ["PENDING", "REVIEWING", "SHORTLISTED", "INTERVIEWING", "ACCEPTED", "REJECTED", "CANCELLED"]) {
    assert.ok(statuses.has(status as ApplicationStatus), `không có đơn ${status}`);
  }
});

test("lịch phỏng vấn: chỉ cho đơn đã tới bước phỏng vấn; lịch sắp tới ≤ 14 ngày, giờ hành chính, mỗi đơn tối đa một", () => {
  const run = full();
  const { job } = lookup(run);
  const app = index(run.history.applications, (a) => a.id!);
  const interviewingAt = new Map<string, number>();
  const decidedAt = new Map<string, number>();
  for (const row of run.history.statusHistory) {
    if (row.toStatus === "INTERVIEWING") interviewingAt.set(row.applicationId, ms(row.createdAt));
    if (row.fromStatus === "INTERVIEWING") decidedAt.set(row.applicationId, ms(row.createdAt));
  }
  const upcomingPerApp = new Map<string, number>();
  for (const interview of run.history.interviews) {
    const a = app.get(interview.applicationId)!;
    const start = interviewingAt.get(a.id!);
    assert.ok(start !== undefined, `${interview.id}: đơn chưa từng ở bước phỏng vấn`);
    assert.ok(ms(interview.createdAt) >= start!, `${interview.id}: tạo trước khi chuyển sang phỏng vấn`);
    assert.ok(ms(interview.createdAt) <= NOW_MS && ms(interview.updatedAt) <= NOW_MS);
    assert.equal(interview.createdById, job.get(a.jobPostId)!.employerUserId);
    if (interview.status === "CANCELLED") {
      assert.ok(interview.cancelReason);
      continue;
    }
    const at = ms(interview.scheduledAt);
    assert.ok(at > ms(interview.createdAt), `${interview.id}: hẹn trước lúc tạo`);
    if (at > NOW_MS) {
      assert.equal(a.status, "INTERVIEWING", `${interview.id}: lịch sắp tới của đơn đã có kết quả`);
      assert.ok(at <= NOW_MS + 14 * DAY, `${interview.id}: lịch quá 14 ngày tới`);
      const vn = new Date(at + 7 * 60 * 60 * 1000);
      const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
      assert.ok(vn.getUTCDay() >= 1 && vn.getUTCDay() <= 5 && minutes >= 510 && minutes <= 990, `${interview.id}: ngoài giờ hành chính`);
      upcomingPerApp.set(a.id!, (upcomingPerApp.get(a.id!) ?? 0) + 1);
    } else if (decidedAt.has(a.id!)) {
      assert.ok(at < decidedAt.get(a.id!)!, `${interview.id}: có kết quả trước buổi phỏng vấn`);
    }
  }
  assert.ok([...upcomingPerApp.values()].every((count) => count === 1));
  assert.ok(upcomingPerApp.size > 20, "quá ít lịch sắp tới");
  // Mọi đơn đang / đã qua bước phỏng vấn đều có lịch.
  const withInterview = new Set(run.history.interviews.map((i) => i.applicationId));
  for (const id of interviewingAt.keys()) assert.ok(withInterview.has(id), `${id}: không có lịch phỏng vấn`);
});

test("mỗi công ty demo có ≥ 2 đơn Chờ duyệt đã 20–60 ngày ở tin còn hiển thị", () => {
  const run = full();
  const { job } = lookup(run);
  const demoCompanies = new Set(run.demo.facts.jobs.filter((j) => j.showcaseKey).map((j) => j.companyId));
  for (const companyId of demoCompanies) {
    const stale = run.history.applications.filter((a) => {
      const j = job.get(a.jobPostId)!;
      const age = (NOW_MS - ms(a.createdAt)) / DAY;
      return a.status === "PENDING" && j.companyId === companyId && j.status === "PUBLISHED" && age >= 20 && age <= 60;
    });
    assert.ok(stale.length >= 2, `${companyId}: chỉ ${stale.length} đơn chờ lâu`);
  }
});

test("lời mời: đúng điều kiện mời, hạn mức 3/ngày/công ty, trạng thái khớp thời gian, có matchScore", () => {
  const run = full();
  const { job, candidate, jobWindowEnd } = lookup(run);
  const applied = new Set(run.history.applications.map((a) => `${a.candidateId}|${a.jobPostId}`));
  const perDay = new Map<string, number>();
  for (const inv of run.history.invitations) {
    const c = candidate.get(inv.candidateId)!;
    const j = job.get(inv.jobPostId)!;
    assert.ok(c.isOpenToOutreach, `${inv.id}: ứng viên không cho mời`);
    assert.notEqual(c.showcaseJobId, j.id, `${inv.id}: mời hồ sơ trưng bày vào tin chính của mình`);
    assert.ok(!applied.has(`${inv.candidateId}|${inv.jobPostId}`), `${inv.id}: ứng viên đã nộp tin này`);
    assert.equal(inv.companyId, j.companyId);
    assert.equal(inv.employerId, j.employerId);
    const created = ms(inv.createdAt);
    assert.ok(created >= j.publishedAt!.getTime() && created <= jobWindowEnd(j.id), `${inv.id}: mời ngoài thời gian tin hiển thị`);
    assert.equal(ms(inv.expiresAt) - created, 14 * DAY);
    const key = `${inv.companyId}|${Math.floor((created + 7 * 60 * 60 * 1000) / DAY)}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
    if (inv.status === "PENDING") {
      assert.ok(ms(inv.expiresAt) > NOW_MS && j.status === "PUBLISHED" && inv.respondedAt === null, `${inv.id}: PENDING sai`);
    } else if (inv.status === "EXPIRED") {
      assert.equal(inv.respondedAt, null);
    } else {
      const responded = ms(inv.respondedAt);
      assert.ok(responded > created && responded <= Math.min(ms(inv.expiresAt), NOW_MS, jobWindowEnd(j.id)), `${inv.id}: trả lời sai thời điểm`);
    }
    assert.ok(typeof inv.matchScore === "number" && inv.matchScore >= 0 && inv.matchScore <= 100);
    assert.equal(inv.matchWeightsVersion, "rule-v1");
  }
  assert.ok([...perDay.values()].every((count) => count <= HISTORY_DAILY_INVITATION_CAP), "vượt hạn mức lời mời/ngày");
  const statuses = new Set(run.history.invitations.map((i) => i.status));
  for (const status of ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"]) assert.ok(statuses.has(status as never), `không có lời mời ${status}`);
});

test("hội thoại: 2–6 tin nhắn của đúng hai bên, sau lúc tạo; mọi lời mời đã chấp nhận đều có hội thoại", () => {
  const run = full();
  const { job, candidate } = lookup(run);
  const messages = new Map<string, typeof run.history.messages>();
  for (const m of run.history.messages) {
    if (!messages.has(m.conversationId)) messages.set(m.conversationId, []);
    messages.get(m.conversationId)!.push(m);
  }
  for (const conv of run.history.conversations) {
    const j = job.get(conv.jobPostId)!;
    assert.equal(conv.employerId, j.employerId);
    const list = messages.get(conv.id!) ?? [];
    assert.ok(list.length >= 2 && list.length <= 6, `${conv.id}: ${list.length} tin nhắn`);
    const parties = new Set([j.employerUserId, candidate.get(conv.candidateId)!.userId]);
    let previous = ms(conv.createdAt);
    for (const m of list) {
      assert.ok(parties.has(m.senderId), `${m.id}: người gửi lạ`);
      assert.ok(ms(m.createdAt) >= previous && ms(m.createdAt) <= NOW_MS, `${m.id}: thời gian sai`);
      assert.ok(!m.content.includes("{"), `${m.id}: còn chỗ trống chưa điền`);
      previous = ms(m.createdAt);
    }
    for (const read of [conv.candidateLastReadAt, conv.employerLastReadAt]) {
      if (read) assert.ok(ms(read) <= NOW_MS);
    }
  }
  const pairs = new Set(run.history.conversations.map((c) => `${c.candidateId}|${c.jobPostId}`));
  for (const inv of run.history.invitations.filter((i) => i.status === "ACCEPTED")) {
    assert.ok(pairs.has(`${inv.candidateId}|${inv.jobPostId}`), `${inv.id}: chấp nhận mà không có hội thoại`);
  }
});

test("tin đã lưu: lưu trong lúc tin hiển thị, sau khi tạo tài khoản", () => {
  const run = full();
  const { job, candidate, jobWindowEnd } = lookup(run);
  for (const saved of run.history.savedJobs) {
    const at = ms(saved.createdAt);
    const j = job.get(saved.jobPostId)!;
    assert.ok(j.publishedAt !== null && at >= j.publishedAt.getTime() && at <= jobWindowEnd(j.id), `${saved.id}: lưu ngoài thời gian tin hiển thị`);
    assert.ok(at > candidate.get(saved.candidateId)!.createdAt.getTime());
  }
});

test("tài khoản demo: ứng viên có lời mời đang chờ và thông báo; mọi thông báo chưa đọc, chỉ cho tài khoản demo", () => {
  const run = full();
  const demoCandidates = run.demo.facts.candidates.filter((c) => c.demoLogin);
  const demoEmployerUsers = new Set(run.demo.facts.jobs.filter((j) => j.showcaseKey).map((j) => j.employerUserId));
  const demoUsers = new Set([...demoCandidates.map((c) => c.userId), ...demoEmployerUsers]);
  for (const c of demoCandidates) {
    assert.ok(run.history.invitations.some((i) => i.candidateId === c.id && i.status === "PENDING"), `${c.email}: không có lời mời đang chờ`);
    assert.ok(run.history.notifications.some((n) => n.userId === c.userId), `${c.email}: không có thông báo`);
  }
  for (const userId of demoEmployerUsers) assert.ok(run.history.notifications.some((n) => n.userId === userId));
  for (const n of run.history.notifications) {
    assert.ok(demoUsers.has(n.userId), `${n.id}: thông báo cho tài khoản không phải demo`);
    assert.equal(n.isRead, false);
    assert.ok(n.title.length > 0 && ms(n.createdAt) <= NOW_MS);
  }
});

test("nhắc lịch đặt sẵn: mỗi lịch sắp tới đúng một dòng, đúng dedupeKey của cron interview-reminder, đã đọc", () => {
  const run = full();
  const application = index(run.history.applications, (a) => a.id!);
  const candidate = index(run.demo.facts.candidates, (c) => c.id);
  const upcoming = run.history.interviews.filter((i) => i.status === "SCHEDULED" && ms(i.scheduledAt) > NOW_MS);
  assert.ok(upcoming.length > 0);
  assert.equal(run.history.reminderGuards.length, upcoming.length);
  const keys = new Set(run.history.reminderGuards.map((n) => n.dedupeKey));
  for (const interview of upcoming) {
    const userId = candidate.get(application.get(interview.applicationId)!.candidateId)!.userId;
    assert.ok(keys.has(`INTERVIEW_REMINDER:${interview.id}:${userId}:${ms(interview.scheduledAt)}`), `${interview.id}: thiếu nhắc lịch đặt sẵn`);
  }
  for (const n of run.history.reminderGuards) {
    assert.equal(n.type, "INTERVIEW_REMINDER");
    assert.equal(n.isRead, true);
    assert.ok(n.id!.startsWith(LARGE_DEMO_ID_PREFIX));
  }
});
