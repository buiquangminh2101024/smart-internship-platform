import { Icon } from "@/components/ui/Icon";

/** Khung xanh ở trang đăng nhập sau khi đổi mật khẩu (`?reset=1`, AD-18). */
export function PasswordChangedNote() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg bg-success-100 px-3.5 py-3 text-sm text-success-700">
      <Icon name="circle-check" size={18} className="mt-px shrink-0" />
      <p>
        <span className="font-semibold">Đã đổi mật khẩu.</span> Mọi thiết bị đang đăng nhập đã bị đăng xuất. Bạn đăng
        nhập lại bằng mật khẩu mới.
      </p>
    </div>
  );
}
