import type { NotificationType } from "@prisma/client";
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

function absolute(ctx: TemplateContext, path: string): string {
  return `${ctx.webBaseUrl.replace(/\/$/, "")}${path}`;
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

  // Chưa có call site — module messaging thuộc Phase 9. Cố ý KHÔNG gửi email:
  // mỗi tin nhắn một email sẽ thành spam; tin nhắn đã có realtime + in-app.
  MESSAGE_RECEIVED: (data) => ({
    title: `Tin nhắn mới từ ${data.senderName}`,
    body: data.preview,
    link: `/messages?conversationId=${encodeURIComponent(data.conversationId)}`,
    email: null,
  }),
};

export function renderNotification<T extends NotificationType>(
  type: T,
  data: NotificationPayloadMap[T],
  ctx: TemplateContext,
): RenderedNotification {
  const render = templates[type] as Renderer<T>;
  return render(data, ctx);
}
