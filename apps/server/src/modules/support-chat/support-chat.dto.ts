import { z } from "zod";
import { HISTORY_MAX_MESSAGES, HISTORY_MESSAGE_MAX_LENGTH, MESSAGE_MAX_LENGTH } from "./support-chat.config";

// D3 — lịch sử từ client là dữ liệu không tin cậy: chỉ text, role ∈ {user, model}, có giới
// hạn số tin và độ dài. `strictObject` từ chối mọi trường lạ (vd. "system", kết quả tool) thay
// vì lặng lẽ bỏ qua. NFC để câu gõ dạng tổ hợp (NFD) được nhận dạng và embed như câu thường.
const text = (max: number) => z.string().trim().min(1).max(max).transform((value) => value.normalize("NFC"));

export const supportChatRequestSchema = z.strictObject({
  message: text(MESSAGE_MAX_LENGTH),
  history: z
    .array(z.strictObject({ role: z.enum(["user", "model"]), text: text(HISTORY_MESSAGE_MAX_LENGTH) }))
    .max(HISTORY_MAX_MESSAGES)
    .default([]),
  faqId: z.string().trim().min(1).max(100).optional(),
});

export type SupportChatRequestInput = z.infer<typeof supportChatRequestSchema>;
