import type { InterviewMode, NotificationType, UserStatus } from "@prisma/client";
import type { SupportCategory } from "@sip/shared-types";
import type { NotificationPayloadMap, RenderedNotification } from "../notification.types";

type Renderer<T extends NotificationType> = (
  data: NotificationPayloadMap[T],
  ctx: TemplateContext,
) => RenderedNotification;

export interface TemplateContext {
  /** Gốc URL của web app, dùng để dựng link tuyệt đối trong email. */
  webBaseUrl: string;
}

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  REVIEWING: "Đang xem xét",
  SHORTLISTED: "Vào danh sách rút gọn",
  INTERVIEWING: "Mời phỏng vấn",
  ACCEPTED: "Được nhận",
  REJECTED: "Bị từ chối",
  CANCELLED: "Đã huỷ",
};

function statusLabel(status: string): string {
  return APPLICATION_STATUS_LABEL[status] ?? status;
}

const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  ACCOUNT_SUSPENDED: "Tài khoản bị khoá",
  OTHER: "Vấn đề khác",
};

const USER_STATUS_LABEL: Record<UserStatus, string> = {
  PENDING_VERIFICATION: "chưa xác thực email",
  ACTIVE: "đang hoạt động",
  SUSPENDED: "đang bị khoá",
};

/** Cắt chuỗi về tối đa `max` ký tự, thêm "…" nếu bị cắt. */
function excerpt(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Khung email chung: dữ liệu truyền vào đều là chuỗi thô do người dùng nhập
 * (tên công ty, tiêu đề tin, lý do từ chối) nên PHẢI escape trước khi nhúng.
 */
function emailHtml(heading: string, paragraphs: string[], action?: { label: string; url: string }): string {
  const body = paragraphs.map((text) => `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(action.url)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : "";
  return [
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827">`,
    `<h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(heading)}</h2>`,
    body,
    button,
    `<p style="margin:32px 0 0;font-size:12px;color:#6b7280">Email tự động từ Smart Internship Platform, vui lòng không trả lời.</p>`,
    `</div>`,
  ].join("");
}

/** dd/mm/yyyy theo giờ Việt Nam — hạn lời mời hiển thị cho người dùng. */
function formatDate(date: Date): string {
  return date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function absolute(ctx: TemplateContext, path: string): string {
  return `${ctx.webBaseUrl.replace(/\/$/, "")}${path}`;
}

/** "dd/mm/yyyy HH:mm (giờ Việt Nam)" — giờ hẹn phỏng vấn. */
function formatDateTime(date: Date): string {
  const time = date.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatDate(date)} ${time} (giờ Việt Nam)`;
}

interface InterviewLines {
  scheduledAt: Date;
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  note: string | null;
}

/** Các dòng chi tiết buổi phỏng vấn trong email, theo thứ tự hiển thị. */
function interviewLines(data: InterviewLines): string[] {
  const lines = [
    `Thời gian: ${formatDateTime(data.scheduledAt)}, khoảng ${data.durationMinutes} phút.`,
    data.mode === "ONLINE" ? "Hình thức: Online." : "Hình thức: Tại văn phòng.",
  ];
  if (data.location) lines.push(`${data.mode === "ONLINE" ? "Liên kết họp" : "Địa chỉ"}: ${data.location}`);
  if (data.note) lines.push(`Ghi chú: ${data.note}`);
  return lines;
}

/**
 * Registry: mỗi NotificationType có đúng một renderer. Kiểu Record<NotificationType, ...>
 * ép phải khai báo đủ mọi loại — thêm enum mới mà quên template sẽ lỗi biên dịch.
 *
 * Renderer chạy MỘT LẦN lúc tạo notification; kết quả được lưu snapshot vào bảng
 * notifications, không render lại về sau.
 */
const templates: { [T in NotificationType]: Renderer<T> } = {
  APPLICATION_STATUS_CHANGED: (data, ctx) => {
    const title = "Cập nhật trạng thái hồ sơ ứng tuyển";
    const body = `Hồ sơ ứng tuyển vị trí "${data.jobPostTitle}" tại ${data.companyName} đã chuyển từ "${statusLabel(data.oldStatus)}" sang "${statusLabel(data.newStatus)}".`;
    const link = "/applications";
    return {
      title,
      body,
      link,
      email: {
        subject: `[${data.companyName}] ${data.jobPostTitle} — ${statusLabel(data.newStatus)}`,
        html: emailHtml(title, [body], { label: "Xem hồ sơ ứng tuyển", url: absolute(ctx, link) }),
      },
    };
  },

  JOB_POST_APPROVED: (data, ctx) => {
    const title = "Tin tuyển dụng đã được duyệt";
    const body = `Tin "${data.jobPostTitle}" đã được duyệt và đang hiển thị công khai.`;
    const link = `/employer/jobs/${data.jobPostId}`;
    return {
      title,
      body,
      link,
      email: {
        subject: `Tin tuyển dụng "${data.jobPostTitle}" đã được duyệt`,
        html: emailHtml(title, [body], { label: "Xem tin tuyển dụng", url: absolute(ctx, link) }),
      },
    };
  },

  JOB_POST_REJECTED: (data, ctx) => {
    const title = "Tin tuyển dụng bị từ chối";
    const body = data.reason
      ? `Tin "${data.jobPostTitle}" chưa được duyệt. Lý do: ${data.reason}`
      : `Tin "${data.jobPostTitle}" chưa được duyệt.`;
    const link = `/employer/jobs/${data.jobPostId}`;
    return {
      title,
      body,
      link,
      email: {
        subject: `Tin tuyển dụng "${data.jobPostTitle}" chưa được duyệt`,
        html: emailHtml(title, [body, "Bạn có thể chỉnh sửa và gửi duyệt lại."], {
          label: "Chỉnh sửa tin",
          url: absolute(ctx, link),
        }),
      },
    };
  },

  JOB_POST_TAKEN_DOWN: (data, ctx) => {
    const title = "Tin tuyển dụng bị gỡ";
    const body = data.reason
      ? `Tin "${data.jobPostTitle}" đã bị gỡ khỏi trang. Lý do: ${data.reason}`
      : `Tin "${data.jobPostTitle}" đã bị gỡ khỏi trang.`;
    const link = `/employer/jobs/${data.jobPostId}`;
    return {
      title,
      body,
      link,
      email: {
        subject: `Tin tuyển dụng "${data.jobPostTitle}" đã bị gỡ`,
        html: emailHtml(title, [body], { label: "Xem chi tiết", url: absolute(ctx, link) }),
      },
    };
  },

  COMPANY_VERIFIED: (data, ctx) => {
    const title = "Công ty đã được xác minh";
    const body = `Công ty ${data.companyName} đã được xác minh. Bạn có thể bắt đầu đăng tin tuyển dụng.`;
    const link = "/employer/profile";
    return {
      title,
      body,
      link,
      email: {
        subject: `Công ty ${data.companyName} đã được xác minh`,
        html: emailHtml(title, [body], { label: "Đăng tin tuyển dụng", url: absolute(ctx, "/employer/jobs/new") }),
      },
    };
  },

  COMPANY_REJECTED: (data, ctx) => {
    const title = "Hồ sơ công ty bị từ chối";
    const body = data.reason
      ? `Hồ sơ xác minh của công ty ${data.companyName} chưa được chấp nhận. Lý do: ${data.reason}`
      : `Hồ sơ xác minh của công ty ${data.companyName} chưa được chấp nhận.`;
    const link = "/employer/profile";
    return {
      title,
      body,
      link,
      email: {
        subject: `Hồ sơ công ty ${data.companyName} chưa được chấp nhận`,
        html: emailHtml(title, [body, "Bạn có thể bổ sung thông tin và gửi lại hồ sơ xác minh."], {
          label: "Cập nhật hồ sơ công ty",
          url: absolute(ctx, link),
        }),
      },
    };
  },

  // AD-12 — thông báo cho Admin, cố ý không gửi email (email: null): Admin xử
  // lý trực tiếp trên dashboard trong giờ làm, gửi email mỗi lần sẽ spam mà
  // không thêm giá trị (khác candidate/employer chờ kết quả nhiều ngày).
  COMPANY_LINK_REQUESTED: (data) => ({
    title: "Yêu cầu liên kết công ty mới",
    body: `Công ty "${data.companyName}" (${data.employerEmail}) vừa gửi hồ sơ liên kết, cần xác minh thủ công.`,
    link: `/admin/companies/${data.companyId}`,
    email: null,
  }),

  JOB_POST_SUBMITTED: (data) => ({
    title: "Tin tuyển dụng chờ duyệt",
    body: `${data.companyName} vừa gửi tin "${data.jobPostTitle}" chờ duyệt.`,
    link: `/admin/jobs/${data.jobPostId}`,
    email: null,
  }),

  // B3, AD-15. Hộp lời mời của Candidate nằm ở trang hồ sơ (frontend PLAN CO-3).
  CANDIDATE_OUTREACH_INVITATION_RECEIVED: (data, ctx) => {
    const title = "Bạn nhận được lời mời ứng tuyển";
    const body = `${data.companyName} mời bạn ứng tuyển vị trí "${data.jobPostTitle}". Lời mời có hiệu lực đến ${formatDate(data.expiresAt)}.`;
    const link = "/job-invitations";
    return {
      title,
      body,
      link,
      email: {
        subject: `[${data.companyName}] Lời mời ứng tuyển: ${data.jobPostTitle}`,
        html: emailHtml(title, [body, "Chấp nhận lời mời để bắt đầu trò chuyện với nhà tuyển dụng."], {
          label: "Xem lời mời",
          url: absolute(ctx, link),
        }),
      },
    };
  },

  // Cố ý không gửi email: NTD theo dõi phản hồi trên danh sách "Đã mời" của tin.
  CANDIDATE_OUTREACH_INVITATION_RESPONDED: (data) => {
    const name = data.candidateName ?? "Ứng viên";
    return {
      title: data.accepted ? "Ứng viên đã chấp nhận lời mời" : "Ứng viên đã từ chối lời mời",
      body: data.accepted
        ? `${name} đã chấp nhận lời mời cho vị trí "${data.jobPostTitle}". Bạn có thể nhắn tin với ứng viên.`
        : `${name} đã từ chối lời mời cho vị trí "${data.jobPostTitle}".`,
      link: `/employer/jobs/${data.jobPostId}/candidate-search`,
      email: null,
    };
  },

  // AD-16 — dashboard. Cố ý không gửi email: chỉ hiển thị trong app, nhóm "Hồ sơ" có đánh dấu đã đọc hàng loạt.
  APPLICATION_RECEIVED: (data) => ({
    title: "Có hồ sơ ứng tuyển mới",
    body: `${data.candidateName ?? "Một ứng viên"} vừa ứng tuyển vị trí "${data.jobPostTitle}".`,
    link: `/employer/applications/${data.applicationId}`,
    email: null,
  }),

  // Do cron hằng ngày tạo (dedupeKey = JOB_POST_EXPIRING:{jobPostId}:{userId}); chỉ trong app.
  JOB_POST_EXPIRING: (data) => ({
    title: "Tin tuyển dụng sắp hết hạn",
    body: `Tin "${data.jobPostTitle}" sẽ hết hạn vào ${formatDate(data.expiresAt)}.`,
    link: `/employer/jobs/${data.jobPostId}`,
    email: null,
  }),

  // Do cron hằng ngày tạo (dedupeKey = SUBSCRIPTION_EXPIRING:{subscriptionId}:{userId}); có email.
  SUBSCRIPTION_EXPIRING: (data, ctx) => {
    const title = "Gói dịch vụ sắp hết hạn";
    const body = `Gói "${data.planName}" sẽ hết hạn vào ${formatDate(data.endDate)}. Gia hạn để tiếp tục đăng tin và tìm ứng viên.`;
    const link = "/employer/subscription";
    return {
      title,
      body,
      link,
      email: {
        subject: `Gói dịch vụ "${data.planName}" sắp hết hạn`,
        html: emailHtml(title, [body], { label: "Xem gói dịch vụ", url: absolute(ctx, link) }),
      },
    };
  },

  // Cho Admin, chỉ trong app. Trang duyệt: kỹ năng ở /admin/skills, trường/ngành ở /admin/education-catalog.
  CATALOG_ENTRY_SUGGESTED: (data) => {
    const label = data.entryType === "SKILL" ? "kỹ năng" : data.entryType === "UNIVERSITY" ? "trường" : "ngành";
    return {
      title: "Có mục danh mục chờ duyệt",
      body: `${data.suggestedByName ?? "Một người dùng"} vừa đề xuất ${label} "${data.entryName}".`,
      link: data.entryType === "SKILL" ? "/admin/skills" : "/admin/education-catalog",
      email: null,
    };
  },

  // Cho Admin, chỉ trong app. Chưa có trang giao dịch cho Admin nên trỏ tới trang công ty (D14).
  PAYMENT_COMPLETED: (data) => ({
    title: "Có thanh toán thành công",
    body: `${data.companyName} đã thanh toán gói "${data.planName}" (${data.amount.toLocaleString("vi-VN")}đ).`,
    link: `/admin/companies/${data.companyId}`,
    email: null,
  }),

  // AD-16 M2 — lịch phỏng vấn. Ba loại dưới chỉ gửi ứng viên, có email; nội dung
  // không nhắc tới ứng viên khác, kể cả khi lên lịch nhóm (D12).
  INTERVIEW_SCHEDULED: (data, ctx) => {
    const title = "Bạn có lịch phỏng vấn mới";
    const body = `${data.companyName} mời bạn phỏng vấn vị trí "${data.jobPostTitle}" lúc ${formatDateTime(data.scheduledAt)}.`;
    const link = "/applications";
    return {
      title,
      body,
      link,
      email: {
        subject: `[${data.companyName}] Lịch phỏng vấn: ${data.jobPostTitle}`,
        html: emailHtml(title, [`${data.companyName} mời bạn phỏng vấn vị trí "${data.jobPostTitle}".`, ...interviewLines(data)], {
          label: "Xem lịch phỏng vấn",
          url: absolute(ctx, link),
        }),
      },
    };
  },

  INTERVIEW_RESCHEDULED: (data, ctx) => {
    const title = "Lịch phỏng vấn đã thay đổi";
    const body = `Lịch phỏng vấn vị trí "${data.jobPostTitle}" tại ${data.companyName} đã đổi sang ${formatDateTime(data.scheduledAt)}.`;
    const link = "/applications";
    return {
      title,
      body,
      link,
      email: {
        subject: `[${data.companyName}] Đổi lịch phỏng vấn: ${data.jobPostTitle}`,
        html: emailHtml(
          title,
          [
            `${data.companyName} đã cập nhật lịch phỏng vấn vị trí "${data.jobPostTitle}".`,
            `Lịch cũ: ${formatDateTime(data.previousScheduledAt)}.`,
            ...interviewLines(data),
          ],
          { label: "Xem lịch phỏng vấn", url: absolute(ctx, link) },
        ),
      },
    };
  },

  INTERVIEW_CANCELLED: (data, ctx) => {
    const title = "Lịch phỏng vấn đã bị huỷ";
    const body = `Buổi phỏng vấn vị trí "${data.jobPostTitle}" tại ${data.companyName} lúc ${formatDateTime(data.scheduledAt)} đã bị huỷ. Lý do: ${data.reason}`;
    const link = "/applications";
    return {
      title,
      body,
      link,
      email: {
        subject: `[${data.companyName}] Huỷ lịch phỏng vấn: ${data.jobPostTitle}`,
        html: emailHtml(title, [body], { label: "Xem hồ sơ ứng tuyển", url: absolute(ctx, link) }),
      },
    };
  },

  // Do cron hằng ngày tạo (dedupeKey = INTERVIEW_REMINDER:{interviewId}:{userId}:{scheduledAt ms}).
  // Ứng viên có email; employer đặt lịch chỉ nhận trong app.
  INTERVIEW_REMINDER: (data, ctx) => {
    const title = "Nhắc lịch phỏng vấn ngày mai";
    if (data.recipientRole === "EMPLOYER") {
      return {
        title,
        body: `Bạn có buổi phỏng vấn với ${data.candidateName ?? "ứng viên"} (vị trí "${data.jobPostTitle}") lúc ${formatDateTime(data.scheduledAt)}.`,
        link: `/employer/applications/${data.applicationId}`,
        email: null,
      };
    }
    const body = `Bạn có buổi phỏng vấn vị trí "${data.jobPostTitle}" tại ${data.companyName} lúc ${formatDateTime(data.scheduledAt)}.`;
    const link = "/applications";
    return {
      title,
      body,
      link,
      email: {
        subject: `[${data.companyName}] Nhắc lịch phỏng vấn ngày mai: ${data.jobPostTitle}`,
        html: emailHtml(title, [`Bạn có buổi phỏng vấn vị trí "${data.jobPostTitle}" tại ${data.companyName}.`, ...interviewLines(data)], {
          label: "Xem lịch phỏng vấn",
          url: absolute(ctx, link),
        }),
      },
    };
  },

  // AD-17 — gửi chính người bị khoá. Người dùng chỉ thấy bản trong app sau khi
  // được mở khoá, nên email mới là kênh báo tin chính.
  ACCOUNT_SUSPENDED: (data, ctx) => {
    const title = "Tài khoản của bạn đã bị khoá";
    const body = `Tài khoản của bạn đã bị quản trị viên khoá. Lý do: ${data.reason}`;
    return {
      title,
      body,
      link: "/support",
      email: {
        subject: "Tài khoản của bạn đã bị khoá",
        html: emailHtml(title, [body, "Nếu bạn cho rằng đây là nhầm lẫn, hãy gửi yêu cầu hỗ trợ cho quản trị viên."], {
          label: "Liên hệ hỗ trợ",
          url: absolute(ctx, "/support?category=ACCOUNT_SUSPENDED"),
        }),
      },
    };
  },

  ACCOUNT_REACTIVATED: (data, ctx) => {
    const title = "Tài khoản của bạn đã được mở khoá";
    const body = data.requiresEmailVerification
      ? "Tài khoản của bạn đã được mở khoá. Bạn cần xác thực email khi đăng nhập lại."
      : "Tài khoản của bạn đã được mở khoá. Bạn có thể đăng nhập lại bình thường.";
    const link = "/login";
    return {
      title,
      body,
      link,
      email: {
        subject: "Tài khoản của bạn đã được mở khoá",
        html: emailHtml(title, [body], { label: "Đăng nhập", url: absolute(ctx, link) }),
      },
    };
  },

  // AD-18 (E3) — Admin kích hoạt thủ công tài khoản chưa xác thực email, sau khi
  // người dùng liên hệ /support. Người dùng chưa từng đăng nhập được nên email là
  // kênh báo tin chính.
  ACCOUNT_ACTIVATED: (_data, ctx) => {
    const title = "Tài khoản của bạn đã được kích hoạt";
    const body = "Quản trị viên đã kích hoạt tài khoản của bạn. Bạn có thể đăng nhập ngay, không cần nhập mã xác thực.";
    const link = "/login";
    return {
      title,
      body,
      link,
      email: {
        subject: "Tài khoản của bạn đã được kích hoạt",
        html: emailHtml(title, [body], { label: "Đăng nhập", url: absolute(ctx, link) }),
      },
    };
  },

  // AD-18 (E1) — Admin chỉ gửi đường dẫn tới /forgot-password, người dùng tự xin
  // OTP ở đó (OTP chỉ sống 5 phút). Không đưa email lên URL để link không làm lộ
  // địa chỉ khi bị chuyển tiếp / ghi log.
  PASSWORD_RESET_SUGGESTED: (_data, ctx) => {
    const title = "Hướng dẫn đặt lại mật khẩu";
    const body =
      "Quản trị viên gửi bạn hướng dẫn đặt lại mật khẩu theo yêu cầu hỗ trợ. Mật khẩu hiện tại của bạn chưa thay đổi.";
    const link = "/forgot-password";
    return {
      title,
      body,
      link,
      email: {
        subject: "Hướng dẫn đặt lại mật khẩu",
        html: emailHtml(
          title,
          [
            body,
            "Bấm nút bên dưới, nhập email của bạn để nhận mã xác thực rồi đặt mật khẩu mới.",
            "Nếu bạn không yêu cầu hỗ trợ, hãy bỏ qua email này.",
          ],
          { label: "Đặt lại mật khẩu", url: absolute(ctx, link) },
        ),
      },
    };
  },

  // Gửi mọi Admin, có email kèm toàn văn lời nhắn (trong app chỉ hiện trích đoạn).
  // Admin trả lời người gửi qua email riêng — nền tảng không có hộp thư hỗ trợ.
  SUPPORT_CONTACT_RECEIVED: (data, ctx) => {
    const title = `Yêu cầu hỗ trợ mới từ ${data.email}`;
    const category = `Loại vấn đề: ${SUPPORT_CATEGORY_LABEL[data.category]}.`;
    const account = `Tài khoản: ${data.accountStatus ? USER_STATUS_LABEL[data.accountStatus] : "không có tài khoản dùng email này"}.`;
    const link = `/admin/users?q=${encodeURIComponent(data.email)}`;
    return {
      title,
      body: `${category} ${account} Nội dung: ${excerpt(data.message, 160)}`,
      link,
      email: {
        subject: `[Hỗ trợ] ${SUPPORT_CATEGORY_LABEL[data.category]} — ${data.email}`,
        html: emailHtml(
          title,
          [
            `Email người gửi: ${data.email}`,
            category,
            account,
            "Nội dung:",
            ...data.message.split(/\r?\n/).filter((line) => line.trim() !== ""),
          ],
          { label: "Xem người dùng", url: absolute(ctx, link) },
        ),
      },
    };
  },

  // Tin nhắn cố ý không có loại notification: không ghi DB mỗi tin, chỉ push
  // realtime qua RealtimeNotifier.pushMessageToUser (Phase 9 bổ sung).
};

export function renderNotification<T extends NotificationType>(
  type: T,
  data: NotificationPayloadMap[T],
  ctx: TemplateContext,
): RenderedNotification {
  const render = templates[type] as Renderer<T>;
  return render(data, ctx);
}
