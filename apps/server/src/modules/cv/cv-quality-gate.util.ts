// Ngưỡng "text trích được có dùng được không" — chốt ở
// docs/temp/CV_OCR_PIPELINE_PROPOSAL.md (PDF) và
// docs/06-backend/cv-ai-extraction-phase1/PLAN.md Quyết định #5 (DOCX).
export const MIN_CHARS_PER_PAGE = 50;
export const MIN_CHARS_WITHOUT_PAGE_COUNT = 200;
export const MAX_WEIRD_CHAR_RATIO = 0.1;

// Chữ (mọi ngôn ngữ, gồm tiếng Việt có dấu), số, khoảng trắng và dấu câu hay
// gặp trong CV. Còn lại — ký tự thay thế U+FFFD, vùng Private Use do font PDF
// nhúng lỗi, ký tự điều khiển — đều tính là "lạ".
const NORMAL_CHAR = /[\p{L}\p{M}\p{N}\s.,;:!?()[\]{}'"/\\@#%&*+\-_=<>|~`^$•·●▪■◆►✓–—…“”‘’°©®™€£¥₫]/u;

/**
 * `pageCount` null (DOCX — mammoth không biết số trang) thì dùng ngưỡng tuyệt
 * đối thay vì chia theo trang.
 */
export function isTextGoodEnough(text: string, pageCount: number | null): boolean {
  const visible = [...text].filter((char) => !/\s/u.test(char));
  if (visible.length === 0) return false;

  const minChars = pageCount && pageCount > 0 ? MIN_CHARS_PER_PAGE * pageCount : MIN_CHARS_WITHOUT_PAGE_COUNT;
  if (visible.length < minChars) return false;

  const weird = visible.filter((char) => !NORMAL_CHAR.test(char)).length;
  return weird / visible.length <= MAX_WEIRD_CHAR_RATIO;
}
