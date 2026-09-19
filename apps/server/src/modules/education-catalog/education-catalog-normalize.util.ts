import { normalizeSkillName } from "../skills/skill-normalize.util";

// Chuẩn hoá tên trường/ngành để SO KHỚP (alias + so trùng), không dùng làm tên
// hiển thị. Dựa trên normalizeSkillName (NFC, chữ thường, bỏ dấu câu) rồi bỏ
// thêm phần "trang trí" mà CV hay ghi nhưng catalog không có.

/**
 * "Trường Đại học Bách khoa Hà Nội" → "đại học bách khoa hà nội";
 * "ĐH Kinh tế Quốc dân" → "đại học kinh tế quốc dân" (viết tắt ĐH/CĐ rất phổ
 * biến trong CV, không mở rộng thì chỉ lọt vùng xám và tốn một lượt LLM).
 */
export function normalizeUniversityName(raw: string): string {
  return normalizeSkillName(raw)
    .replace(/^trường\s+/, "")
    .replace(/^đh\s+/, "đại học ")
    .replace(/^cđ\s+/, "cao đẳng ");
}

/**
 * "Ngành Công nghệ thông tin (CLC), chuyên ngành An toàn thông tin"
 * → "công nghệ thông tin". Cùng quy tắc cắt chú thích cuối tên mà
 * scripts/seed-education-catalog.ts đã dùng khi gộp ngành từ dữ liệu tuyển
 * sinh — nhờ vậy tên gõ vào khớp được đúng tên đã seed.
 */
export function normalizeMajorName(raw: string): string {
  let bare = raw.trim();
  let changed = true;
  while (changed) {
    const before = bare;
    bare = bare.replace(/\s*\([^()]*\)\s*$/, "").trim();
    bare = bare.replace(/,\s*chuyên ngành[^,]*$/i, "").trim();
    changed = bare !== before;
  }
  return normalizeSkillName(bare).replace(/^(chuyên ngành|ngành)\s+/, "");
}
