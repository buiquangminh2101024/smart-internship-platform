// Chạy: node --import tsx --test tests/unit/job-alerts.test.ts (từ apps/server)
// Job alert (AD-26 D7–D9, docs/06-backend/job-discovery/PLAN.md bước 5): JobAlertService với
// repository giả (câu chọn ứng viên kiểm trên Neon), NotificationsService.upsertDaily, template,
// cài đặt. Lối (a) gọi job alert: tests/unit/match-scores.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { AppError } from "../../src/shared/errors/AppError";
import type {
  CandidateJobAlertSettingsRow,
  InsertedJobAlert,
  JobAlertSettingsPatch,
} from "../../src/modules/job-alerts/job-alert.repository";
import {
  JobAlertService,
  jobAlertDedupeKey,
  vnDateKey,
  vnDayStart,
} from "../../src/modules/job-alerts/job-alert.service";
import { updateJobAlertSettingsSchema } from "../../src/modules/job-alerts/job-alerts.dto";
import { JOB_ALERT_MIN_SCORE_FLOOR } from "../../src/modules/job-alerts/job-alerts.config";
import { NotificationsService } from "../../src/modules/notifications/notifications.service";
import { NOTIFICATION_GROUP_BY_TYPE } from "../../src/modules/notifications/notification-groups";
import { renderNotification } from "../../src/modules/notifications/templates/notification-templates";

// ─── Ngày theo giờ Việt Nam ────────────────────────────────────────────────

test("ngày giờ VN: 16:59:59Z còn ngày cũ, 17:00Z sang ngày mới; đầu ngày đổi về UTC", () => {
  assert.equal(vnDateKey(new Date("2026-11-13T16:59:59.999Z")), "2026-11-13");
  assert.equal(vnDateKey(new Date("2026-11-13T17:00:00.000Z")), "2026-11-14");
  assert.equal(vnDayStart(new Date("2026-11-13T20:00:00Z")).toISOString(), "2026-11-13T17:00:00.000Z");
  assert.equal(vnDayStart(new Date("2026-11-13T16:00:00Z")).toISOString(), "2026-11-12T17:00:00.000Z");
  assert.equal(vnDayStart(new Date("2026-11-13T17:00:00Z")).toISOString(), "2026-11-13T17:00:00.000Z");
  assert.equal(jobAlertDedupeKey("c1", new Date("2026-11-13T18:00:00Z")), "job-alert:c1:2026-11-14");
});

// ─── JobAlertService.onJobScored ───────────────────────────────────────────

interface UpsertCall {
  type: string;
  userId: string;
  data: Record<string, unknown>;
  dedupeKey: string;
}

function alertSetup(options: {
  job?: { title: string; companyName: string } | null;
  inserted?: InsertedJobAlert[];
  counts?: Record<string, number>;
  failUsers?: string[];
  insertGate?: Promise<void>;
  insertFails?: boolean;
} = {}) {
  const calls = { inserts: [] as Array<{ jobPostId: string; floor: number; createdAt: Date }>, countSince: [] as Array<{ ids: string[]; since: Date }> };
  const upserts: UpsertCall[] = [];
  const errors: Array<Record<string, unknown>> = [];
  const infos: Array<Record<string, unknown>> = [];
  const jobAlertRepository = {
    findJobSummary: async () => (options.job === undefined ? { title: "Thực tập React", companyName: "Mây Xanh" } : options.job),
    insertForJob: async (jobPostId: string, floor: number, createdAt: Date) => {
      await options.insertGate;
      if (options.insertFails) throw new Error("db down");
      calls.inserts.push({ jobPostId, floor, createdAt });
      return options.inserted ?? [];
    },
    countSince: async (ids: string[], since: Date) => {
      calls.countSince.push({ ids, since });
      return new Map(Object.entries(options.counts ?? {}));
    },
  };
  const notificationsService = {
    upsertDaily: async (type: string, userId: string, data: Record<string, unknown>, dedupeKey: string) => {
      if (options.failUsers?.includes(userId)) throw new Error("notify failed");
      upserts.push({ type, userId, data, dedupeKey });
      return (data.todayCount as number) > 1 ? "UPDATED" : "CREATED";
    },
  };
  const service = new JobAlertService({
    jobAlertRepository,
    notificationsService,
    logger: {
      info: (_msg: string, meta: Record<string, unknown>) => infos.push(meta),
      warn: () => {},
      error: (_msg: string, meta: Record<string, unknown>) => errors.push(meta),
    },
    config: { CORS_ORIGIN: "https://web.test" },
  } as unknown as ConstructorParameters<typeof JobAlertService>[0]);
  return { service, calls, upserts, errors, infos };
}

const NOW = new Date("2026-11-13T03:00:00Z"); // 10:00 giờ VN ngày 13/11

test("onJobScored: ghi job_alerts với sàn 70, mỗi người vừa ghi một upsertDaily đúng khoá và số tin trong ngày", async () => {
  const { service, calls, upserts } = alertSetup({
    inserted: [
      { candidateId: "c1", userId: "u1", score: 91 },
      { candidateId: "c2", userId: "u2", score: 80 },
    ],
    counts: { c1: 1, c2: 3 },
  });
  const result = await service.onJobScored("job-1", NOW);

  assert.equal(JOB_ALERT_MIN_SCORE_FLOOR, 70);
  assert.deepEqual(calls.inserts, [{ jobPostId: "job-1", floor: 70, createdAt: NOW }]);
  assert.deepEqual(calls.countSince, [{ ids: ["c1", "c2"], since: new Date("2026-11-12T17:00:00Z") }]);
  assert.deepEqual(upserts, [
    {
      type: "JOB_ALERT",
      userId: "u1",
      data: { jobPostId: "job-1", jobPostTitle: "Thực tập React", companyName: "Mây Xanh", score: 91, todayCount: 1 },
      dedupeKey: "job-alert:c1:2026-11-13",
    },
    {
      type: "JOB_ALERT",
      userId: "u2",
      data: { jobPostId: "job-1", jobPostTitle: "Thực tập React", companyName: "Mây Xanh", score: 80, todayCount: 3 },
      dedupeKey: "job-alert:c2:2026-11-13",
    },
  ]);
  assert.deepEqual(result, { alerted: 2, created: 1, updated: 1, failed: 0 });
});

test("onJobScored: không ai mới (đã báo / không đạt) ⇒ không đếm, không thông báo", async () => {
  const { service, calls, upserts } = alertSetup({ inserted: [] });
  assert.deepEqual(await service.onJobScored("job-1", NOW), { alerted: 0, created: 0, updated: 0, failed: 0 });
  assert.equal(calls.countSince.length, 0);
  assert.equal(upserts.length, 0);
});

test("onJobScored: tin không còn ⇒ không ghi gì", async () => {
  const { service, calls } = alertSetup({ job: null, inserted: [{ candidateId: "c1", userId: "u1", score: 90 }] });
  assert.equal((await service.onJobScored("job-1", NOW)).alerted, 0);
  assert.equal(calls.inserts.length, 0);
});

test("onJobScored: thông báo của một người lỗi ⇒ ghi log, vẫn báo người sau", async () => {
  const { service, upserts, errors } = alertSetup({
    inserted: [
      { candidateId: "c1", userId: "u1", score: 90 },
      { candidateId: "c2", userId: "u2", score: 85 },
    ],
  });
  const failing = alertSetup({
    inserted: [
      { candidateId: "c1", userId: "u1", score: 90 },
      { candidateId: "c2", userId: "u2", score: 85 },
    ],
    failUsers: ["u1"],
  });
  await service.onJobScored("job-1", NOW);
  const result = await failing.service.onJobScored("job-1", NOW);
  assert.equal(upserts.length, 2);
  assert.deepEqual(failing.upserts.map((call) => call.userId), ["u2"]);
  assert.deepEqual(result, { alerted: 2, created: 1, updated: 0, failed: 1 });
  assert.equal(errors.length, 0);
  assert.equal(failing.errors.length, 1);
  // Không có số đếm (không xảy ra vì vừa ghi) ⇒ coi là 1.
  assert.equal(failing.upserts[0]!.data.todayCount, 1);
});

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};

test("trigger: các lượt chạy lần lượt; lỗi chỉ ghi log và không chặn lượt sau", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { service, calls } = alertSetup({ insertGate: gate, inserted: [{ candidateId: "c1", userId: "u1", score: 90 }] });
  service.trigger("job-1");
  service.trigger("job-2");
  await settle();
  assert.equal(calls.inserts.length, 0, "lượt 2 chờ lượt 1");
  release();
  await settle();
  assert.deepEqual(calls.inserts.map((call) => call.jobPostId), ["job-1", "job-2"]);

  const failing = alertSetup({ insertFails: true });
  failing.service.trigger("job-1");
  failing.service.trigger("job-2");
  await settle();
  assert.deepEqual(failing.errors.map((meta) => meta.jobPostId), ["job-1", "job-2"]);
});

// ─── Cài đặt ───────────────────────────────────────────────────────────────

function settingsSetup(row: CandidateJobAlertSettingsRow | null) {
  const patches: JobAlertSettingsPatch[] = [];
  const service = new JobAlertService({
    jobAlertRepository: {
      findSettingsByUserId: async () => row,
      updateSettings: async (_candidateId: string, patch: JobAlertSettingsPatch) => {
        patches.push(patch);
        return { ...row!, ...patch };
      },
    },
    notificationsService: {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    config: { CORS_ORIGIN: "https://web.test" },
  } as unknown as ConstructorParameters<typeof JobAlertService>[0]);
  return { service, patches };
}

const DEFAULT_ROW: CandidateJobAlertSettingsRow = {
  candidateId: "c1",
  cityId: null,
  cityName: null,
  enabled: true,
  emailEnabled: true,
  sameCityOnly: false,
};

test("cài đặt: GET trả ba công tắc kèm thành phố; chưa có hồ sơ ⇒ 404", async () => {
  const { service } = settingsSetup({ ...DEFAULT_ROW, cityId: "hn", cityName: "Hà Nội" });
  assert.deepEqual(await service.getSettingsForUser("u1"), {
    enabled: true,
    emailEnabled: true,
    sameCityOnly: false,
    cityName: "Hà Nội",
  });
  await assert.rejects(
    () => settingsSetup(null).service.getSettingsForUser("u1"),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("cài đặt: bật chỉ-thành-phố khi hồ sơ chưa có thành phố ⇒ 400 JOB_ALERT_CITY_REQUIRED, không ghi", async () => {
  const { service, patches } = settingsSetup(DEFAULT_ROW);
  await assert.rejects(
    () => service.updateSettingsForUser("u1", { sameCityOnly: true }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400 && error.code === "JOB_ALERT_CITY_REQUIRED",
  );
  assert.equal(patches.length, 0);
  // Tắt, hay đổi công tắc khác, thì không cần thành phố.
  const result = await service.updateSettingsForUser("u1", { enabled: false, sameCityOnly: false });
  assert.deepEqual(patches, [{ enabled: false, sameCityOnly: false }]);
  assert.equal(result.enabled, false);
});

test("cài đặt: có thành phố ⇒ bật chỉ-thành-phố được", async () => {
  const { service } = settingsSetup({ ...DEFAULT_ROW, cityId: "hn", cityName: "Hà Nội" });
  assert.equal((await service.updateSettingsForUser("u1", { sameCityOnly: true })).sameCityOnly, true);
});

test("cài đặt: PATCH rỗng hoặc sai kiểu bị từ chối", () => {
  assert.equal(updateJobAlertSettingsSchema.safeParse({}).success, false);
  assert.equal(updateJobAlertSettingsSchema.safeParse({ enabled: "yes" }).success, false);
  assert.equal(updateJobAlertSettingsSchema.safeParse({ emailEnabled: false }).success, true);
});

// ─── Template, nhóm ────────────────────────────────────────────────────────

const CTX = { webBaseUrl: "https://web.test" };

test("template JOB_ALERT: tiêu đề là tổng trong ngày, nêu tin mới nhất, link Việc làm phù hợp, không email", () => {
  const base = { jobPostId: "j1", jobPostTitle: "Thực tập React", companyName: "Mây Xanh", score: 86 };
  const one = renderNotification("JOB_ALERT", { ...base, todayCount: 1 }, CTX);
  assert.equal(one.title, "1 tin mới phù hợp với bạn");
  assert.equal(one.body, '"Thực tập React" của Mây Xanh, phù hợp 86%.');
  assert.equal(one.link, "/recommended-jobs");
  assert.equal(one.email, null);
  const two = renderNotification("JOB_ALERT", { ...base, todayCount: 2 }, CTX);
  assert.equal(two.title, "2 tin mới phù hợp với bạn");
  assert.equal(two.body, 'Mới nhất: "Thực tập React" của Mây Xanh, phù hợp 86%.');
});

test("template PROFILE_SKILLS_REMINDER: link hồ sơ, có email với link tuyệt đối", () => {
  const rendered = renderNotification("PROFILE_SKILLS_REMINDER", {}, CTX);
  assert.equal(rendered.link, "/profile");
  assert.ok(rendered.email);
  assert.match(rendered.email.html, /https:\/\/web\.test\/profile/);
});

test("nhóm thông báo: JOB_ALERT vào Lời mời, PROFILE_SKILLS_REMINDER vào Tài khoản (tab của ứng viên)", () => {
  assert.equal(NOTIFICATION_GROUP_BY_TYPE.JOB_ALERT, "INVITATIONS");
  assert.equal(NOTIFICATION_GROUP_BY_TYPE.PROFILE_SKILLS_REMINDER, "ACCOUNT");
});

// ─── NotificationsService.upsertDaily ──────────────────────────────────────

interface StoredNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupeKey: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

function notificationsSetup(options: { raceOnCreate?: boolean } = {}) {
  const rows: StoredNotification[] = [];
  const outbox: unknown[] = [];
  const pushes: Array<{ userId: string; payload: { id: string; title: string } }> = [];
  let seq = 0;
  const insert = (data: Omit<StoredNotification, "id" | "isRead" | "readAt" | "createdAt">) => {
    const row = { ...data, id: `n${++seq}`, isRead: false, readAt: null, createdAt: new Date("2026-11-13T01:00:00Z") };
    rows.push(row);
    return row;
  };
  const notificationsRepository = {
    existsByDedupeKey: async (key: string) => rows.some((row) => row.dedupeKey === key),
    findOwnerByDedupeKey: async (key: string) => {
      const row = rows.find((item) => item.dedupeKey === key);
      return row ? { id: row.id, userId: row.userId } : null;
    },
    create: async (data: Omit<StoredNotification, "id" | "isRead" | "readAt" | "createdAt">) => {
      if (options.raceOnCreate) {
        // Một lượt khác vừa tạo cùng khoá ⇒ unique vi phạm.
        insert({ ...data, title: "bản của lượt khác" });
        throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
      }
      return insert(data);
    },
    refresh: async (id: string, data: { title: string; body: string | null; link: string | null }, now: Date) => {
      const row = rows.find((item) => item.id === id)!;
      Object.assign(row, data, { isRead: false, readAt: null, createdAt: now });
      return row;
    },
  };
  const service = new NotificationsService({
    prisma: {
      user: { findUnique: async () => ({ email: "u@test.local" }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ user: { findUnique: async () => ({ email: "u@test.local" }) } }),
    },
    notificationsRepository,
    outboxRepository: { create: async (data: unknown) => outbox.push(data) },
    realtimeNotifier: { pushToUser: async (userId: string, payload: { id: string; title: string }) => pushes.push({ userId, payload }) },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    config: { CORS_ORIGIN: "https://web.test" },
  } as unknown as ConstructorParameters<typeof NotificationsService>[0]);
  return { service, rows, outbox, pushes };
}

const ALERT = { jobPostId: "j1", jobPostTitle: "Thực tập React", companyName: "Mây Xanh", score: 86 };

test("upsertDaily: lần đầu tạo mới; tin sau cùng ngày cập nhật đúng thông báo đó, đặt lại chưa đọc, đưa lên đầu, đẩy realtime", async () => {
  const { service, rows, outbox, pushes } = notificationsSetup();
  assert.equal(await service.upsertDaily("JOB_ALERT", "u1", { ...ALERT, todayCount: 1 }, "job-alert:c1:2026-11-13"), "CREATED");
  rows[0]!.isRead = true;
  rows[0]!.readAt = new Date();

  const before = Date.now();
  const outcome = await service.upsertDaily(
    "JOB_ALERT",
    "u1",
    { ...ALERT, jobPostTitle: "Thực tập Node", todayCount: 2 },
    "job-alert:c1:2026-11-13",
  );
  assert.equal(outcome, "UPDATED");
  assert.equal(rows.length, 1, "không có thông báo thứ hai");
  assert.equal(rows[0]!.title, "2 tin mới phù hợp với bạn");
  assert.match(rows[0]!.body!, /Thực tập Node/);
  assert.equal(rows[0]!.isRead, false);
  assert.equal(rows[0]!.readAt, null);
  assert.ok(rows[0]!.createdAt.getTime() >= before);
  assert.deepEqual(pushes.map((push) => [push.userId, push.payload.id, push.payload.title]), [
    ["u1", "n1", "1 tin mới phù hợp với bạn"],
    ["u1", "n1", "2 tin mới phù hợp với bạn"],
  ]);
  assert.equal(outbox.length, 0, "JOB_ALERT không gửi email từng tin");
});

test("upsertDaily: ngày khác ⇒ thông báo mới", async () => {
  const { service, rows } = notificationsSetup();
  await service.upsertDaily("JOB_ALERT", "u1", { ...ALERT, todayCount: 1 }, "job-alert:c1:2026-11-13");
  await service.upsertDaily("JOB_ALERT", "u1", { ...ALERT, todayCount: 1 }, "job-alert:c1:2026-11-14");
  assert.equal(rows.length, 2);
});

test("upsertDaily: hai lượt cùng tạo một khoá ⇒ bên chậm hơn cập nhật bản đã có", async () => {
  const { service, rows } = notificationsSetup({ raceOnCreate: true });
  const outcome = await service.upsertDaily("JOB_ALERT", "u1", { ...ALERT, todayCount: 2 }, "job-alert:c1:2026-11-13");
  assert.equal(outcome, "UPDATED");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.title, "2 tin mới phù hợp với bạn");
});

test("upsertDaily: khoá thuộc người khác ⇒ bỏ qua, không sửa", async () => {
  const { service, rows } = notificationsSetup();
  await service.upsertDaily("JOB_ALERT", "u1", { ...ALERT, todayCount: 1 }, "job-alert:c1:2026-11-13");
  assert.equal(await service.upsertDaily("JOB_ALERT", "u2", { ...ALERT, todayCount: 5 }, "job-alert:c1:2026-11-13"), "SKIPPED");
  assert.equal(rows[0]!.title, "1 tin mới phù hợp với bạn");
});
