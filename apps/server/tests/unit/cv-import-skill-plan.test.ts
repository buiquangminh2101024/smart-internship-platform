// Chạy: node --import tsx --test tests/unit/cv-import-skill-plan.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSkillWrites } from "../../src/modules/candidates/candidate-cv-import.service";

test("Kỹ năng chưa có trong hồ sơ → thêm mới với số năm vừa nhập", () => {
  const plan = planSkillWrites([], [{ skillId: "react", yearsOfExperience: 2 }]);
  assert.deepEqual(plan.creates, [{ skillId: "react", yearsOfExperience: 2 }]);
  assert.deepEqual(plan.updates, []);
});

test("Kỹ năng chưa có, người dùng để trống → thêm mới với 0 (chưa khai)", () => {
  const plan = planSkillWrites([], [{ skillId: "react", yearsOfExperience: 0 }]);
  assert.deepEqual(plan.creates, [{ skillId: "react", yearsOfExperience: 0 }]);
  assert.deepEqual(plan.updates, []);
});

test("Đã khai 3 năm, import nhập 1 → giữ nguyên 3, import không ghi đè", () => {
  const plan = planSkillWrites(
    [{ skillId: "react", yearsOfExperience: 3 }],
    [{ skillId: "react", yearsOfExperience: 1 }],
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.updates, []);
});

test("Đang 0 (chưa khai), import nhập 2 → cập nhật thành 2", () => {
  const plan = planSkillWrites(
    [{ skillId: "react", yearsOfExperience: 0 }],
    [{ skillId: "react", yearsOfExperience: 2 }],
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.updates, [{ skillId: "react", yearsOfExperience: 2 }]);
});

test("Đang 0 và import cũng 0 → không ghi gì (tránh UPDATE thừa)", () => {
  const plan = planSkillWrites(
    [{ skillId: "react", yearsOfExperience: 0 }],
    [{ skillId: "react", yearsOfExperience: 0 }],
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.updates, []);
});

test("Hai tên cùng ra một skillId → một dòng, lấy số năm lớn hơn", () => {
  const plan = planSkillWrites(
    [],
    [
      { skillId: "react", yearsOfExperience: 2 },
      { skillId: "react", yearsOfExperience: 4 },
    ],
  );
  assert.deepEqual(plan.creates, [{ skillId: "react", yearsOfExperience: 4 }]);
  assert.deepEqual(plan.updates, []);
});

test("Nhiều kỹ năng lẫn lộn: mỗi loại rơi đúng nhóm của nó", () => {
  const plan = planSkillWrites(
    [
      { skillId: "react", yearsOfExperience: 3 },
      { skillId: "sql", yearsOfExperience: 0 },
    ],
    [
      { skillId: "react", yearsOfExperience: 5 },
      { skillId: "sql", yearsOfExperience: 1.5 },
      { skillId: "docker", yearsOfExperience: 0 },
    ],
  );
  assert.deepEqual(plan.creates, [{ skillId: "docker", yearsOfExperience: 0 }]);
  assert.deepEqual(plan.updates, [{ skillId: "sql", yearsOfExperience: 1.5 }]);
});
