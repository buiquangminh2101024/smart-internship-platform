import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * Gợi ý gửi yêu cầu hỗ trợ khi nhập OTP mãi không được (AD-31 D7). `href` từ
 * `otpSupportHref` (điền sẵn loại "Vấn đề khác", email, nội dung). `newTab` cho thẻ
 * "Mật khẩu" ở Cài đặt, để không rời trang đang đăng nhập.
 */
export function OtpSupportHint({
  href,
  purpose,
  newTab = false,
}: {
  href: string;
  purpose: "register" | "reset";
  newTab?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-page px-3.5 py-3 text-sm text-text-body">
      <Icon name="life-buoy" size={18} className="mt-px shrink-0 text-text-muted" />
      <p>
        Không nhận được mã hoặc nhập mãi không được?{" "}
        <Link
          href={href}
          className="font-semibold text-brand-700 hover:underline"
          {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
        >
          Gửi yêu cầu hỗ trợ
        </Link>
        {purpose === "register"
          ? ", quản trị viên sẽ kiểm tra và kích hoạt tài khoản giúp bạn."
          : ", quản trị viên sẽ kiểm tra và hướng dẫn bạn lấy lại mật khẩu."}
      </p>
    </div>
  );
}
