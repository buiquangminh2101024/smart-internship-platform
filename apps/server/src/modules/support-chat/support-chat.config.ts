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

// ─── Request (D3) ────────────────────────────────────────────────────────
export const MESSAGE_MAX_LENGTH = 500;
export const HISTORY_MAX_MESSAGES = 10;
export const HISTORY_MESSAGE_MAX_LENGTH = 1000;

// ─── Rate-limit (PLAN mục "Rate-limit và hạn mức") ───────────────────────
export const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
export const RATE_LIMIT_GUEST_PER_WINDOW = 20;
export const RATE_LIMIT_USER_PER_WINDOW = 40;

// ─── Cache câu trả lời bậc 3 (D8) ────────────────────────────────────────
export const ANSWER_CACHE_MAX_ENTRIES = 500;
export const ANSWER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Câu gợi ý khi hội thoại trống (GET /support/chat/suggestions) — câu hỏi mẫu đầu tiên của
 * từng mục. Mục không tồn tại hoặc người hỏi không được thấy thì bị bỏ (kèm cảnh báo log).
 */
export const SUGGESTED_FAQ_IDS = {
  guest: ["about-internhub", "account-register", "job-search", "job-apply", "jobpost-create", "subscription-plans"],
  candidate: ["cv-upload", "job-apply", "application-status", "recommended-jobs", "candidate-interviews", "profile-insight"],
  employer: [
    "jobpost-create",
    "jobpost-approval",
    "subscription-plans",
    "employer-applications",
    "employer-interviews",
    "company-verification",
  ],
} as const;

// ─── GĐ2 — câu hỏi về dữ liệu của chính người hỏi ─────────────────────────

/**
 * Chủ đề dữ liệu theo vai trò (viết không dấu) cho asksAboutOwnData. Vai trò không có ở đây
 * thì câu hỏi không bao giờ bị coi là hỏi về dữ liệu riêng. Ngôi thứ nhất "chúng tôi", "bên
 * mình", "công ty mình" đã khớp sẵn qua `tôi`/`mình`. "tin" của Employer không tính "tin nhắn",
 * "thông tin".
 */
export const OWN_DATA_TOPICS: Partial<Record<"guest" | "candidate" | "employer", RegExp>> = {
  candidate: /\b(?:don|ung tuyen|nop|ho so|phong van|lich|cv)\b/,
  employer: /\b(?:(?<!thong )tin(?! nhan)|ho so|ung vien|don|goi|dung thu|han muc|luot|het han)\b/,
};

/** Câu hỏi về dữ liệu mà không tầng Gemini nào trả lời được ⇒ chỉ trang xem trực tiếp. */
export const OWN_DATA_UNAVAILABLE_REPLY: Partial<Record<"guest" | "candidate" | "employer", string>> = {
  candidate:
    "Trợ lý chưa tra được dữ liệu của bạn lúc này. Bạn xem trực tiếp đơn ứng tuyển và lịch phỏng vấn ở /applications, độ hoàn thiện hồ sơ ở /profile nhé.",
  employer:
    "Trợ lý chưa tra được dữ liệu của công ty bạn lúc này. Bạn xem trực tiếp tin tuyển dụng ở /employer/jobs, hồ sơ ứng tuyển ở /employer/applications, gói dịch vụ ở /employer/subscription nhé.",
};
