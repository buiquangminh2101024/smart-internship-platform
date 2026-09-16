// Chuẩn hoá tên skill để SO KHỚP — không dùng làm tên hiển thị (tên hiển thị
// giữ nguyên chữ hoa/dấu người dùng gõ) và KHÔNG từ chối input xấu (việc đó là
// của validate trong skills.dto.ts, chạy trước ở tầng route).
//
// Ví dụ: "React.JS  " → "react js", "Lập Trình C++" → "lập trình c++".

// Ký tự giữ lại ngoài chữ/số: "+" và "#" là một phần tên thật của nhiều ngôn ngữ
// lập trình (C++, C#, F#) — bỏ đi sẽ gộp nhầm C, C++ và C# thành một.
const KEEP_CHARS = /[^\p{L}\p{N}+#\s]/gu;

export function normalizeSkillName(raw: string): string {
  return raw
    // NFC: "ệ" gõ bằng tổ hợp dấu rời và "ệ" dựng sẵn là 2 chuỗi khác nhau về
    // byte nhưng cùng một chữ — không chuẩn hoá thì alias exact match trượt.
    .normalize("NFC")
    .toLowerCase()
    .replace(KEEP_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tách thành tập từ để tính Jaccard — bỏ trùng lặp, bỏ token rỗng. */
export function tokenizeSkillName(raw: string): Set<string> {
  const normalized = normalizeSkillName(raw);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}
