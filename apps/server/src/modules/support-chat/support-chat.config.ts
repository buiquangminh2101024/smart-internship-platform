// Ngưỡng của bậc 2 (so khớp FAQ bằng embedding local) — đặt trong code, không ở env, để
// có version và đi cùng code được review. Giá trị gắn với đúng model embedding + bộ FAQ
// hiện tại: đổi model hoặc sửa FAQ thì chạy lại `npm run support-chat:index` rồi
// `npm run support-chat:eval`. Quy tắc chọn: docs/06-backend/support-chatbot/PLAN.md mục
// "Pipeline xử lý một câu hỏi"; số liệu: docs/06-backend/support-chatbot/eval/eval-results.md.
//
// Câu gõ không dấu (isAccentFree trong faq-knowledge-base.ts) không qua hai ngưỡng DIRECT và
// OUT_OF_SCOPE: luôn xuống bậc 3–4. Đợt B: trả thẳng câu không dấu chỉ đúng 20% ở ngưỡng 0.9.

/**
 * Câu hỏi mới (chưa có lịch sử) có score ≥ ngưỡng ⇒ trả thẳng đáp án FAQ.
 * Đợt B: 0.875 đạt ≥ 95% chính xác nhưng chỉ cách một câu trả thẳng sai 0.0003 (q035,
 * 0.8747) ⇒ lấy bậc lưới kế tiếp. 8/8 đúng, phủ 10% câu `faq` của bộ eval. Bản nháp 0.85
 * trả thẳng sai 1/11.
 */
export const DIRECT_THRESHOLD = 0.9;
/**
 * Câu nối tiếp chỉ trả thẳng khi score rất cao — "vậy nó giá bao nhiêu?" cần ngữ cảnh.
 * Đợt B: giữ 0.92; câu nối tiếp sai mục có score cao nhất là 0.899.
 */
export const DIRECT_THRESHOLD_WITH_HISTORY = 0.92;
/**
 * Câu hỏi mới có score < ngưỡng ⇒ từ chối "ngoài phạm vi". Câu nối tiếp không bị chặn.
 * Đợt B: 0.475 không chặn nhầm câu trong phạm vi nào (thấp nhất 0.508), chặn 7/13 câu có dấu
 * ngoài phạm vi; phần lọt xuống bậc 4 do prompt từ chối. Trước khi miễn chặn câu không dấu,
 * ngưỡng an toàn chỉ tới 0.325 (câu không dấu trong phạm vi có score từ 0.329).
 */
export const OUT_OF_SCOPE_THRESHOLD = 0.475;
/** Số mục FAQ đưa vào prompt ở bậc 4 (xếp theo contextRankOf trong faq-knowledge-base.ts). */
export const RAG_TOP_K = 3;
