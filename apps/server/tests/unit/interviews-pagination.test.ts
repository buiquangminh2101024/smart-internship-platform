// Chạy: node --import tsx --test tests/unit/interviews-pagination.test.ts (từ apps/server)
// Chế độ "sắp tới" của GET /employer/interviews: cắt trang không ngang một ngày (giờ
// Việt Nam) và cursor mờ (scheduledAt, id). SQL không được kiểm ở đây.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cutAtDayBoundary, decodeCursor, encodeCursor } from "../../src/modules/interviews/interviews.service";

/** `count` buổi cách nhau 1 giờ từ `startIso`. */
function slots(startIso: string, count: number) {
  const start = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, index) => ({
    id: `i-${startIso}-${index}`,
    scheduledAt: new Date(start + index * 60 * 60 * 1000),
  }));
}

/** Mỗi buổi một ngày khác nhau (10:00 giờ VN). */
function oneADay(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `d-${index}`,
    scheduledAt: new Date(Date.UTC(2026, 10, 1 + index, 3)),
  }));
}

test("ít hơn pageSize dòng: trả hết, không còn trang sau", () => {
  const rows = oneADay(7);
  const page = cutAtDayBoundary(rows, 20, 100);
  assert.equal(page.items.length, 7);
  assert.equal(page.hasMore, false);
});

test("đúng pageSize dòng: trả hết, không còn trang sau", () => {
  const page = cutAtDayBoundary(oneADay(20), 20, 100);
  assert.equal(page.items.length, 20);
  assert.equal(page.hasMore, false);
});

test("ngày cuối kéo dài qua dòng thứ 20: lấy trọn ngày đó", () => {
  // 18 ngày mỗi ngày một buổi, rồi một ngày 6 buổi (dòng 19–24), rồi thêm 5 ngày.
  const before = oneADay(18);
  const busyDay = slots("2026-12-01T01:00:00Z", 6);
  const after = Array.from({ length: 5 }, (_, index) => ({
    id: `a-${index}`,
    scheduledAt: new Date(Date.UTC(2026, 11, 2 + index, 3)),
  }));
  const rows = [...before, ...busyDay, ...after];
  const page = cutAtDayBoundary(rows, 20, 100);
  assert.equal(page.items.length, 24);
  assert.equal(page.hasMore, true);
  assert.equal(page.items.at(-1)!.id, busyDay.at(-1)!.id);
});

test("ranh giới ngày theo giờ Việt Nam, không theo UTC", () => {
  const rows = oneADay(19);
  // 23:30 ngày 30/11 và 00:30 ngày 01/12 giờ VN — cùng ngày 30/11 theo UTC.
  rows.push({ id: "late", scheduledAt: new Date("2026-11-30T16:30:00Z") });
  rows.push({ id: "early", scheduledAt: new Date("2026-11-30T17:30:00Z") });
  rows.push({ id: "next", scheduledAt: new Date("2026-12-01T03:00:00Z") });
  const page = cutAtDayBoundary(rows, 20, 100);
  assert.equal(page.items.length, 20);
  assert.equal(page.items.at(-1)!.id, "late");
  assert.equal(page.hasMore, true);
});

test("một ngày vượt mức trần: cắt ở trần, ngày đó sang trang sau", () => {
  const rows = slots("2026-11-01T00:00:00Z", 1).concat(
    Array.from({ length: 130 }, (_, index) => ({
      id: `busy-${String(index).padStart(3, "0")}`,
      scheduledAt: new Date(Date.UTC(2026, 10, 2, 2, 0, index)),
    })),
  );
  const page = cutAtDayBoundary(rows.slice(0, 101), 20, 100);
  assert.equal(page.items.length, 100);
  assert.equal(page.hasMore, true);
});

test("cursor đi về khớp", () => {
  const position = { scheduledAt: new Date("2026-11-05T02:15:00.000Z"), id: "cm0abc|lạ" };
  const decoded = decodeCursor(encodeCursor(position));
  assert.equal(decoded.id, position.id);
  assert.equal(decoded.scheduledAt.toISOString(), position.scheduledAt.toISOString());
});

test("cursor rác báo 400", () => {
  for (const bad of ["", "abc", Buffer.from("not-a-date|id").toString("base64url"), Buffer.from("2026-11-05T02:15:00Z|").toString("base64url")]) {
    assert.throws(() => decodeCursor(bad), (error: { statusCode?: number }) => error.statusCode === 400, bad);
  }
});
