// Chạy: node --import tsx --test tests/unit/cv-quality-gate.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTextGoodEnough } from "../../src/modules/cv/cv-quality-gate.util";

const vietnameseCv =
  "Nguyễn Văn A — Sinh viên năm cuối ngành Công nghệ thông tin, Đại học Bách khoa Hà Nội. " +
  "Kỹ năng: ReactJS, Node.js, PostgreSQL. Kinh nghiệm: thực tập 6 tháng tại công ty ABC (2024-01 → 2024-06). ";

test("PDF: đủ ký tự/trang và ít ký tự lạ → tốt", () => {
  assert.equal(isTextGoodEnough(vietnameseCv.repeat(2), 2), true);
});

test("PDF: dưới 50 ký tự/trang → kém (PDF scan không có text layer)", () => {
  assert.equal(isTextGoodEnough("Nguyễn Văn A", 1), false);
  assert.equal(isTextGoodEnough(vietnameseCv, 5), false);
});

test("PDF: text rỗng/toàn khoảng trắng → kém", () => {
  assert.equal(isTextGoodEnough("", 1), false);
  assert.equal(isTextGoodEnough("   \n\n\t  ", 1), false);
});

test("Quá 10% ký tự lạ (font nhúng lỗi, U+FFFD, Private Use) → kém", () => {
  const garbled = vietnameseCv + "�".repeat(20) + "".repeat(20);
  assert.equal(isTextGoodEnough(garbled, 1), false);
});

test("Dấu đầu dòng/ký hiệu hay gặp trong CV không bị tính là ký tự lạ", () => {
  const bullets = "• ReactJS ● Node.js ▪ SQL – 2024 … “Dự án” ✓ ".repeat(10);
  assert.equal(isTextGoodEnough(bullets, 1), true);
});

test("DOCX (không có pageCount): ngưỡng tuyệt đối 200 ký tự", () => {
  assert.equal(isTextGoodEnough("x".repeat(150), null), false);
  assert.equal(isTextGoodEnough(vietnameseCv.repeat(2), null), true);
});
