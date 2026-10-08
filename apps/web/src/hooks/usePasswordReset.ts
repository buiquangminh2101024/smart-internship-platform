"use client";

import { useMutation } from "@tanstack/react-query";
import type { ForgotPasswordRequest, ResetPasswordRequest } from "@sip/shared-types";
import { publicFetch } from "@/lib/api-client";

/*
 * Đặt lại mật khẩu bằng OTP (AD-18, E1, E9): trang `/forgot-password` và thẻ
 * "Mật khẩu" ở Cài đặt dùng chung. Cả hai endpoint công khai, không cần token.
 */

/** Xin mã. Server luôn trả thành công dù email có tài khoản hay không; quá hạn mức thì 429. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      publicFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email } satisfies ForgotPasswordRequest),
      }),
  });
}

/** Đặt mật khẩu mới. Sai mã hoặc mã hết hạn ⇒ 400. Thành công ⇒ server đăng xuất mọi thiết bị. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (data: ResetPasswordRequest) =>
      publicFetch("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
  });
}
