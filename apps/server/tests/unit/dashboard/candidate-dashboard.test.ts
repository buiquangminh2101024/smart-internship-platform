// Chạy: node --import tsx --test tests/unit/dashboard/candidate-dashboard.test.ts (từ apps/server)
// Unit test cho các quy tắc xử lý và tính toán số liệu trên Candidate Dashboard:
// - Lọc & sắp xếp phỏng vấn sắp tới
// - Phân biệt link họp trực tuyến và địa điểm thực tế
// - Chọn CV đại diện (mặc định hoặc đầu tiên)
// - Tính toán số liệu đơn ứng tuyển (đang xử lý vs đã hoàn tất)
// - Danh sách đơn nộp gần nhất
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterUpcomingInterviews,
  isOnlineMeetingLocation,
  resolvePrimaryCv,
  computeApplicationMetrics,
  getRecentApplications,
  type CandidateInterviewLike,
  type CandidateCvLike,
  type CandidateApplicationLike,
} from "../../../src/modules/dashboard/candidate-dashboard.util";

const BASE_TIME = new Date("2026-11-24T12:00:00.000Z");

// ==========================================
// Test suite 1: filterUpcomingInterviews
// ==========================================

test("filterUpcomingInterviews: bỏ qua các buổi phỏng vấn đã qua hoặc bị CANCELLED", () => {
  const interviews: CandidateInterviewLike[] = [
    {
      id: "inv-past",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-11-20T10:00:00.000Z"), // Đã qua
    },
    {
      id: "inv-cancelled",
      status: "CANCELLED",
      scheduledAt: new Date("2026-11-25T10:00:00.000Z"), // Tương lai nhưng bị hủy
    },
    {
      id: "inv-future-1",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-11-26T09:00:00.000Z"), // Hợp lệ
    },
  ];

  const upcoming = filterUpcomingInterviews(interviews, BASE_TIME);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].id, "inv-future-1");
});

test("filterUpcomingInterviews: sắp xếp lịch phỏng vấn theo thời gian tăng dần (sớm nhất lên đầu)", () => {
  const interviews: CandidateInterviewLike[] = [
    {
      id: "inv-later",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-11-28T14:00:00.000Z"),
    },
    {
      id: "inv-earliest",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-11-25T08:00:00.000Z"),
    },
    {
      id: "inv-middle",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-11-26T10:00:00.000Z"),
    },
  ];

  const upcoming = filterUpcomingInterviews(interviews, BASE_TIME);
  assert.equal(upcoming.length, 3);
  assert.equal(upcoming[0].id, "inv-earliest");
  assert.equal(upcoming[1].id, "inv-middle");
  assert.equal(upcoming[2].id, "inv-later");
});

test("filterUpcomingInterviews: danh sách rỗng hoặc đầu vào không hợp lệ → trả mảng rỗng", () => {
  assert.deepEqual(filterUpcomingInterviews([], BASE_TIME), []);
  assert.deepEqual(filterUpcomingInterviews(null as any, BASE_TIME), []);
});

// ==========================================
// Test suite 2: isOnlineMeetingLocation
// ==========================================

test("isOnlineMeetingLocation: nhận diện đúng link họp trực tuyến (http/https)", () => {
  assert.equal(isOnlineMeetingLocation("https://meet.google.com/abc-defg-hij"), true);
  assert.equal(isOnlineMeetingLocation("http://zoom.us/j/123456789"), true);
  assert.equal(isOnlineMeetingLocation("  https://teams.microsoft.com/l/meetup-join/123  "), true);
});

test("isOnlineMeetingLocation: nhận diện địa điểm trực tiếp hoặc văn phòng", () => {
  assert.equal(isOnlineMeetingLocation("Tầng 5, Tòa nhà ABC, Quận 1, TP.HCM"), false);
  assert.equal(isOnlineMeetingLocation("Phòng họp số 3"), false);
  assert.equal(isOnlineMeetingLocation(""), false);
  assert.equal(isOnlineMeetingLocation(null), false);
  assert.equal(isOnlineMeetingLocation(undefined), false);
});

// ==========================================
// Test suite 3: resolvePrimaryCv
// ==========================================

test("resolvePrimaryCv: ưu tiên CV có cờ isDefault = true", () => {
  const cvs: CandidateCvLike[] = [
    { id: "cv-1", fileName: "cv1.pdf", fileUrl: "/cv1.pdf", isDefault: false },
    { id: "cv-2", fileName: "cv2.pdf", fileUrl: "/cv2.pdf", isDefault: true },
    { id: "cv-3", fileName: "cv3.pdf", fileUrl: "/cv3.pdf", isDefault: false },
  ];

  const primary = resolvePrimaryCv(cvs);
  assert.equal(primary?.id, "cv-2");
});

test("resolvePrimaryCv: nếu không có CV nào là default, chọn CV đầu tiên", () => {
  const cvs: CandidateCvLike[] = [
    { id: "cv-first", fileName: "first.pdf", fileUrl: "/first.pdf", isDefault: false },
    { id: "cv-second", fileName: "second.pdf", fileUrl: "/second.pdf", isDefault: false },
  ];

  const primary = resolvePrimaryCv(cvs);
  assert.equal(primary?.id, "cv-first");
});

test("resolvePrimaryCv: danh sách rỗng → trả về null an toàn", () => {
  assert.equal(resolvePrimaryCv([]), null);
  assert.equal(resolvePrimaryCv(null as any), null);
});

// ==========================================
// Test suite 4: computeApplicationMetrics
// ==========================================

test("computeApplicationMetrics: phân loại chính xác đơn đang xử lý và đơn đã kết thúc", () => {
  const apps: CandidateApplicationLike[] = [
    { id: "app-1", status: "SUBMITTED", createdAt: "2026-11-01" },
    { id: "app-2", status: "REVIEWING", createdAt: "2026-11-02" },
    { id: "app-3", status: "SHORTLISTED", createdAt: "2026-11-03" },
    { id: "app-4", status: "INTERVIEWING", createdAt: "2026-11-04" },
    { id: "app-5", status: "ACCEPTED", createdAt: "2026-11-05" },
    { id: "app-6", status: "REJECTED", createdAt: "2026-11-06" },
    { id: "app-7", status: "WITHDRAWN", createdAt: "2026-11-07" },
    { id: "app-8", status: "JOB_CLOSED", createdAt: "2026-11-08" },
  ];

  const metrics = computeApplicationMetrics(apps);
  assert.equal(metrics.total, 8);
  assert.equal(metrics.active, 4); // SUBMITTED, REVIEWING, SHORTLISTED, INTERVIEWING
  assert.equal(metrics.completed, 4); // ACCEPTED, REJECTED, WITHDRAWN, JOB_CLOSED
});

test("computeApplicationMetrics: xử lý danh sách rỗng an toàn", () => {
  const metrics = computeApplicationMetrics([]);
  assert.deepEqual(metrics, { total: 0, active: 0, completed: 0 });
});

// ==========================================
// Test suite 5: getRecentApplications
// ==========================================

test("getRecentApplications: sắp xếp theo ngày nộp mới nhất lên đầu và cắt đúng giới hạn", () => {
  const apps: CandidateApplicationLike[] = [
    { id: "app-old", status: "SUBMITTED", createdAt: "2026-10-01T00:00:00Z" },
    { id: "app-newest", status: "REVIEWING", createdAt: "2026-11-20T00:00:00Z" },
    { id: "app-middle", status: "INTERVIEWING", createdAt: "2026-11-10T00:00:00Z" },
    { id: "app-older", status: "REJECTED", createdAt: "2026-10-15T00:00:00Z" },
  ];

  const recent2 = getRecentApplications(apps, 2);
  assert.equal(recent2.length, 2);
  assert.equal(recent2[0].id, "app-newest");
  assert.equal(recent2[1].id, "app-middle");

  const recentDefault = getRecentApplications(apps);
  assert.equal(recentDefault.length, 4);
  assert.equal(recentDefault[0].id, "app-newest");
});
