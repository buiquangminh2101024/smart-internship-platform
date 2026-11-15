// Chạy: node --import tsx --test tests/unit/job-alert-digest.test.ts (từ apps/server)
// Job alert bước 6 (AD-26 D8, D10; docs/06-backend/job-discovery/PLAN.md): email gộp 8h, nhắc thêm
// kỹ năng, lượt hằng ngày. Repository là bản giả — các câu SQL kiểm trên Neon.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DigestJobRow, PendingDigestCandidate, SkillsReminderTarget } from "../../src/modules/job-alerts/job-alert.repository";
import { JobAlertService, SKILLS_REMINDER_DEDUPE_PREFIX } from "../../src/modules/job-alerts/job-alert.service";
import { JOB_ALERT_DAILY_CRON, JOB_ALERT_DIGEST_MAX_JOBS } from "../../src/modules/job-alerts/job-alerts.config";
import { renderJobAlertDigestEmail } from "../../src/modules/notifications/templates/notification-templates";

const NOW = new Date("2026-11-14T01:00:00Z"); // 08:00 giờ VN ngày 14/11

function job(index: number, score = 90 - index): DigestJobRow {
  return { jobPostId: `j${index}`, title: `Tin ${index}`, companyName: "Mây Xanh", score };
}

function candidate(id: string, sendable = true, pending = 1): PendingDigestCandidate {
  return { candidateId: id, userId: `u-${id}`, email: `${id}@test.local`, sendable, pending };
}

interface DigestFakeOptions {
  pending?: PendingDigestCandidate[];
  /** jobPostId nhận được khi claim theo ứng viên; thiếu ⇒ []. */
  claims?: Record<string, string[]>;
  /** Tin còn đáng gửi theo ứng viên. */
  digestJobs?: Record<string, DigestJobRow[]>;
  /** Ứng viên làm transaction lỗi (outbox lỗi). */
  failOutboxFor?: string[];
  reminderTargets?: SkillsReminderTarget[];
  /** userId ⇒ kết quả notifyOnce; "throw" ⇒ lỗi. */
  notifyOnce?: Record<string, boolean | "throw">;
  pendingGate?: Promise<void>;
}

function setup(options: DigestFakeOptions = {}) {
  const calls = {
    marked: [] as Array<{ ids: string[]; cutoff: Date; now: Date }>,
    claimed: [] as Array<{ tx: unknown; candidateId: string; cutoff: Date; now: Date }>,
    digestJobs: [] as Array<{ db: unknown; candidateId: string; ids: string[] }>,
    outbox: [] as Array<{ data: { eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }; tx: unknown }>,
    reminderCutoffs: [] as Array<{ createdBefore: Date; prefix: string }>,
    notifyOnce: [] as Array<{ type: string; userId: string; data: unknown; key: string }>,
    committed: [] as string[],
  };
  const errors: Array<Record<string, unknown>> = [];
  const TX = { tx: true };
  const jobAlertRepository = {
    findPendingDigestCandidates: async () => {
      await options.pendingGate;
      return options.pending ?? [];
    },
    markWithoutSending: async (ids: string[], cutoff: Date, now: Date) => {
      calls.marked.push({ ids, cutoff, now });
      return (options.pending ?? []).filter((c) => ids.includes(c.candidateId)).reduce((sum, c) => sum + c.pending, 0);
    },
    claimForDigest: async (tx: unknown, candidateId: string, cutoff: Date, now: Date) => {
      calls.claimed.push({ tx, candidateId, cutoff, now });
      return options.claims?.[candidateId] ?? [];
    },
    findPendingJobPostIds: async (candidateId: string) => options.claims?.[candidateId] ?? [],
    findDigestJobs: async (db: unknown, candidateId: string, ids: string[]) => {
      calls.digestJobs.push({ db, candidateId, ids });
      return options.digestJobs?.[candidateId] ?? [];
    },
    runInTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const result = await fn(TX);
      calls.committed.push(String(result));
      return result;
    },
    findSkillsReminderTargets: async (createdBefore: Date, prefix: string) => {
      calls.reminderCutoffs.push({ createdBefore, prefix });
      return options.reminderTargets ?? [];
    },
  };
  const outboxRepository = {
    create: async (data: (typeof calls.outbox)[number]["data"], tx: unknown) => {
      if (options.failOutboxFor?.includes(data.aggregateId)) throw new Error("outbox down");
      calls.outbox.push({ data, tx });
    },
  };
  const notificationsService = {
    notifyOnce: async (type: string, userId: string, data: unknown, key: string) => {
      const outcome = options.notifyOnce?.[userId] ?? true;
      if (outcome === "throw") throw new Error("notify failed");
      calls.notifyOnce.push({ type, userId, data, key });
      return outcome;
    },
  };
  const service = new JobAlertService({
    jobAlertRepository,
    notificationsService,
    outboxRepository,
    logger: { info: () => {}, warn: () => {}, error: (_msg: string, meta: Record<string, unknown>) => errors.push(meta) },
    config: { CORS_ORIGIN: "https://web.test" },
  } as unknown as ConstructorParameters<typeof JobAlertService>[0]);
  return { service, calls, errors, TX };
}

// ─── Email gộp ─────────────────────────────────────────────────────────────

test("email gộp: mỗi ứng viên một outbox trong cùng transaction với việc nhận dòng; tối đa 10 tin, điểm cao trước", async () => {
  const twelve = Array.from({ length: 12 }, (_, index) => job(index));
  const { service, calls, TX } = setup({
    pending: [candidate("c1", true, 12)],
    claims: { c1: twelve.map((row) => row.jobPostId) },
    digestJobs: { c1: twelve },
  });
  const result = await service.sendDailyDigests(NOW);

  assert.equal(JOB_ALERT_DIGEST_MAX_JOBS, 10);
  assert.deepEqual(calls.claimed, [{ tx: TX, candidateId: "c1", cutoff: NOW, now: NOW }]);
  assert.equal(calls.digestJobs[0]!.db, TX);
  assert.equal(calls.outbox.length, 1);
  const { data, tx } = calls.outbox[0]!;
  assert.equal(tx, TX);
  assert.equal(data.eventType, "NOTIFICATION_EMAIL");
  assert.equal(data.aggregateType, "Candidate");
  assert.equal(data.aggregateId, "c1");
  assert.equal(data.payload.to, "c1@test.local");
  assert.equal(data.payload.notificationType, "JOB_ALERT");
  assert.equal(data.payload.subject, "12 tin mới phù hợp với bạn");
  const html = String(data.payload.html);
  assert.match(html, /Tin 0<\/a>/);
  assert.match(html, /Tin 9<\/a>/);
  assert.doesNotMatch(html, /Tin 10<\/a>/);
  assert.match(html, /và 2 tin khác/);
  assert.deepEqual(result, {
    candidates: 1,
    emailsQueued: 1,
    jobsInEmails: 12,
    nothingToSend: 0,
    raced: 0,
    notSendable: 0,
    rowsMarkedWithoutSending: 0,
    failed: 0,
  });
});

test("email gộp: tắt email / không gửi được ⇒ chỉ đánh dấu; mọi tin đã hết hiển thị ⇒ nhận dòng, không gửi; lượt khác đã nhận ⇒ không gửi", async () => {
  const { service, calls } = setup({
    pending: [candidate("off", false, 3), candidate("empty", true, 2), candidate("raced", true, 1), candidate("ok", true, 1)],
    claims: { empty: ["j1", "j2"], ok: ["j3"] },
    digestJobs: { ok: [job(3)] },
  });
  const result = await service.sendDailyDigests(NOW);

  assert.deepEqual(calls.marked, [{ ids: ["off"], cutoff: NOW, now: NOW }]);
  assert.deepEqual(
    calls.claimed.map((call) => call.candidateId),
    ["empty", "raced", "ok"],
    "không nhận dòng của người tắt email (đã đánh dấu riêng)",
  );
  assert.deepEqual(calls.digestJobs.map((call) => call.candidateId), ["empty", "ok"], "nhận 0 dòng thì không đọc tin");
  assert.deepEqual(calls.outbox.map((call) => call.data.aggregateId), ["ok"]);
  assert.deepEqual(result, {
    candidates: 4,
    emailsQueued: 1,
    jobsInEmails: 1,
    nothingToSend: 1,
    raced: 1,
    notSendable: 1,
    rowsMarkedWithoutSending: 3,
    failed: 0,
  });
});

test("email gộp: lỗi một người ⇒ transaction của người đó huỷ, ghi log, người sau vẫn gửi", async () => {
  const { service, calls, errors } = setup({
    pending: [candidate("bad"), candidate("good")],
    claims: { bad: ["j1"], good: ["j2"] },
    digestJobs: { bad: [job(1)], good: [job(2)] },
    failOutboxFor: ["bad"],
  });
  const result = await service.sendDailyDigests(NOW);
  assert.deepEqual(calls.committed, ["1"], "chỉ transaction của người thành công được commit");
  assert.deepEqual(calls.outbox.map((call) => call.data.aggregateId), ["good"]);
  assert.equal(result.failed, 1);
  assert.equal(result.emailsQueued, 1);
  assert.deepEqual(errors.map((meta) => meta.candidateId), ["bad"]);
});

test("email gộp --dry-run: đếm như lượt thật mà không nhận dòng, không đánh dấu, không ghi outbox", async () => {
  const { service, calls } = setup({
    pending: [candidate("off", false, 3), candidate("empty", true, 2), candidate("ok", true, 2)],
    claims: { empty: ["j1", "j2"], ok: ["j3", "j4"] },
    digestJobs: { ok: [job(3), job(4)] },
  });
  assert.deepEqual(await service.previewDailyDigests(NOW), {
    candidates: 3,
    wouldEmail: 1,
    jobsInEmails: 2,
    nothingToSend: 1,
    notSendable: 1,
    rowsMarkedWithoutSending: 3,
  });
  assert.equal(calls.claimed.length, 0);
  assert.equal(calls.marked.length, 0);
  assert.equal(calls.outbox.length, 0);
  assert.ok(calls.digestJobs.every((call) => call.db === undefined), "đọc ngoài transaction");
});

test("mẫu email gộp: escape tên tin / công ty, link tuyệt đối tới từng tin, Việc làm phù hợp và Cài đặt", () => {
  const email = renderJobAlertDigestEmail(
    { jobs: [{ jobPostId: "j1", title: "Dev <script>", companyName: "A & B", score: 88 }], total: 1 },
    { webBaseUrl: "https://web.test/" },
  );
  assert.equal(email.subject, "1 tin mới phù hợp với bạn");
  assert.match(email.html, /Dev &lt;script&gt;/);
  assert.match(email.html, /A &amp; B · phù hợp 88%/);
  assert.match(email.html, /href="https:\/\/web\.test\/jobs\/j1"/);
  assert.match(email.html, /href="https:\/\/web\.test\/recommended-jobs"/);
  assert.match(email.html, /href="https:\/\/web\.test\/settings"/);
  assert.doesNotMatch(email.html, /tin khác/);
});

// ─── Nhắc thêm kỹ năng ─────────────────────────────────────────────────────

test("nhắc kỹ năng: tài khoản tạo trước 24 giờ; notifyOnce khoá theo ứng viên; trùng / lỗi đếm riêng", async () => {
  const { service, calls, errors } = setup({
    reminderTargets: [
      { candidateId: "c1", userId: "u1" },
      { candidateId: "c2", userId: "u2" },
      { candidateId: "c3", userId: "u3" },
    ],
    notifyOnce: { u2: false, u3: "throw" },
  });
  const result = await service.sendSkillsReminders(NOW);
  assert.deepEqual(calls.reminderCutoffs, [
    { createdBefore: new Date("2026-11-13T01:00:00Z"), prefix: SKILLS_REMINDER_DEDUPE_PREFIX },
  ]);
  assert.deepEqual(calls.notifyOnce, [
    { type: "PROFILE_SKILLS_REMINDER", userId: "u1", data: {}, key: "profile-skills-reminder:c1" },
    { type: "PROFILE_SKILLS_REMINDER", userId: "u2", data: {}, key: "profile-skills-reminder:c2" },
  ]);
  assert.deepEqual(result, { targets: 3, created: 1, duplicates: 1, failed: 1 });
  assert.deepEqual(errors.map((meta) => meta.candidateId), ["c3"]);
});

// ─── Lượt hằng ngày ────────────────────────────────────────────────────────

test("lượt 8h: email gộp rồi nhắc kỹ năng; đang chạy ⇒ LOCKED; xong thì chạy lại được", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { service, calls } = setup({ pendingGate: gate, reminderTargets: [{ candidateId: "c1", userId: "u1" }] });
  assert.equal(JOB_ALERT_DAILY_CRON, "0 8 * * *");

  const first = service.runDaily(NOW);
  assert.deepEqual(await service.runDaily(NOW), { status: "LOCKED" });
  release();
  const result = await first;
  assert.equal(result.status, "DONE");
  assert.equal(result.status === "DONE" && result.reminders.created, 1);
  assert.equal(calls.notifyOnce.length, 1);
  assert.equal((await service.runDaily(NOW)).status, "DONE");
});
