// Parser cho định dạng FAQ của chatbot hỗ trợ (docs/06-backend/support-chatbot/PLAN.md
// mục "Kho FAQ"). Tự viết thay vì thêm thư viện front-matter/markdown vì định dạng chỉ
// có vài dòng cố định:
//
//   # Tên nhóm                 ← bỏ qua
//   ## faq-id
//   audience: employer
//   title: Tiêu đề
//   questions:
//   - Câu hỏi mẫu 1
//   - Câu hỏi mẫu 2
//                              ← dòng trống kết thúc danh sách câu hỏi
//   Nội dung trả lời…          ← mọi thứ tới "## " kế tiếp
//
// Sai định dạng thì ném lỗi kèm tên file và số dòng: FAQ do người soạn tay, lỗi phải lộ
// ngay khi chạy script index hoặc khởi động server, không để một mục bị bỏ âm thầm.

export const FAQ_AUDIENCES = ["all", "guest", "candidate", "employer"] as const;
export type FaqAudience = (typeof FAQ_AUDIENCES)[number];

export interface FaqItem {
  id: string;
  audience: FaqAudience;
  title: string;
  questions: string[];
  answer: string;
  sourceFile: string;
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Chuẩn hoá trước khi parse, hash và embed: Git trên Windows (autocrlf) trả CRLF, một
 * số trình soạn thảo lưu tiếng Việt dạng NFD. Không chuẩn hoá thì cùng một nội dung
 * cho ra hash khác nhau giữa các máy và index đã commit bị coi là lệch.
 */
export function normalizeFaqText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").normalize("NFC");
}

export function parseFaqMarkdown(markdown: string, sourceFile: string): FaqItem[] {
  const lines = normalizeFaqText(markdown).split("\n");
  const items: FaqItem[] = [];
  let index = 0;

  const fail = (message: string, lineIndex = index): never => {
    throw new Error(`${sourceFile}:${lineIndex + 1}: ${message}`);
  };

  // Phần trước "## " đầu tiên chỉ được là tên nhóm và dòng trống.
  while (index < lines.length && !lines[index]!.startsWith("## ")) {
    const line = lines[index]!.trim();
    if (line !== "" && !line.startsWith("# ")) fail("nội dung nằm ngoài mục FAQ nào");
    index++;
  }

  while (index < lines.length) {
    const headingIndex = index;
    const id = lines[index]!.slice(3).trim();
    if (!ID_PATTERN.test(id)) fail(`id "${id}" không hợp lệ (chỉ chữ thường, số, dấu gạch ngang)`);
    index++;

    const audience = readField("audience");
    if (!(FAQ_AUDIENCES as readonly string[]).includes(audience)) {
      fail(`audience "${audience}" không thuộc ${FAQ_AUDIENCES.join(" | ")}`, index - 1);
    }
    const title = readField("title");
    if (title === "") fail("title rỗng", index - 1);

    if (lines[index]?.trim() !== "questions:") fail('thiếu dòng "questions:"');
    index++;
    const questions: string[] = [];
    while (index < lines.length && lines[index]!.trim() !== "") {
      const line = lines[index]!.trim();
      if (!line.startsWith("- ")) fail('câu hỏi mẫu phải bắt đầu bằng "- "');
      const question = line.slice(2).trim();
      if (question !== "") questions.push(question);
      index++;
    }
    if (questions.length === 0) fail("mục không có câu hỏi mẫu nào", headingIndex);

    const answerLines: string[] = [];
    while (index < lines.length && !lines[index]!.startsWith("## ")) {
      answerLines.push(lines[index]!);
      index++;
    }
    const answer = answerLines.join("\n").trim();
    if (answer === "") fail("mục không có nội dung trả lời", headingIndex);

    items.push({ id, audience: audience as FaqAudience, title, questions, answer, sourceFile });
  }

  return items;

  function readField(name: string): string {
    const line = lines[index] ?? "";
    const prefix = `${name}:`;
    if (!line.startsWith(prefix)) fail(`thiếu dòng "${prefix}"`);
    index++;
    return line.slice(prefix.length).trim();
  }
}
