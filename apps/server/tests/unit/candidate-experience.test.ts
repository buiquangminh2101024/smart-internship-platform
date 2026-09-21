// Chạy: node --import tsx --test tests/unit/candidate-experience.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotalExperienceYears } from "../../src/modules/job-matching/candidate-experience.util";

const TODAY = new Date("2026-01-01T00:00:00Z");
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function approx(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 0.01, `${actual} ≈ ${expected}`);
}

test("Không có dòng nào → null (không xác định, không phải 0)", () => {
  assert.equal(computeTotalExperienceYears([], TODAY), null);
});

test("Một khoảng 2 năm", () => {
  approx(computeTotalExperienceYears([{ startDate: d("2022-01-01"), endDate: d("2024-01-01"), isCurrent: false }], TODAY), 2);
});

test("Hai khoảng chồng lấp chỉ tính một lần", () => {
  const years = computeTotalExperienceYears(
    [
      { startDate: d("2022-01-01"), endDate: d("2023-07-01"), isCurrent: false },
      { startDate: d("2023-01-01"), endDate: d("2024-01-01"), isCurrent: false },
    ],
    TODAY,
  );
  approx(years, 2);
});

test("Hai khoảng rời nhau được cộng", () => {
  const years = computeTotalExperienceYears(
    [
      { startDate: d("2024-01-01"), endDate: d("2025-01-01"), isCurrent: false },
      { startDate: d("2020-01-01"), endDate: d("2021-01-01"), isCurrent: false },
    ],
    TODAY,
  );
  approx(years, 2);
});

test("isCurrent → tính tới hôm nay (bỏ qua endDate)", () => {
  approx(computeTotalExperienceYears([{ startDate: d("2025-01-01"), endDate: null, isCurrent: true }], TODAY), 1);
});

test("Dòng thiếu startDate hoặc thiếu cả endDate lẫn isCurrent bị bỏ qua", () => {
  assert.equal(
    computeTotalExperienceYears(
      [
        { startDate: null, endDate: d("2024-01-01"), isCurrent: false },
        { startDate: d("2023-01-01"), endDate: null, isCurrent: false },
      ],
      TODAY,
    ),
    null,
  );
});

test("Dòng có end < start bị bỏ qua, dòng hợp lệ còn lại vẫn tính", () => {
  const years = computeTotalExperienceYears(
    [
      { startDate: d("2024-01-01"), endDate: d("2023-01-01"), isCurrent: false },
      { startDate: d("2024-01-01"), endDate: d("2025-01-01"), isCurrent: false },
    ],
    TODAY,
  );
  approx(years, 1);
});
