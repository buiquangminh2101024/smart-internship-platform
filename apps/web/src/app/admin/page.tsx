"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthTokensResponse } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { fetchProfileWithToken } from "@/lib/auth";
import { useAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Trang bí mật — chỉ email/password, không Google, không link đăng ký, không
// có entry point từ nơi khác (xem AD-1). Sai role cũng chỉ báo lỗi chung,
// không tiết lộ đây là trang dành riêng cho Admin.
export default function AdminLoginPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    const refreshToken = useAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Ưu tiên clear phía client ngay cả khi API logout thất bại.
    } finally {
      useAuthStore.getState().clear();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const tokens = await apiFetch<AuthTokensResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const loggedInUser = await fetchProfileWithToken(tokens.accessToken);

      if (loggedInUser.role !== "ADMIN") {
        setError("Sai email hoặc mật khẩu");
        return;
      }

      useAuthStore.getState().setSession(tokens, loggedInUser);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sai email hoặc mật khẩu");
    } finally {
      setSubmitting(false);
    }
  }

  if (user?.role === "ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-plum-800 px-6">
        <div className="grid w-full max-w-sm gap-4 rounded-2xl border border-white/10 bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-text-strong">Đã đăng nhập</h1>
          <p className="text-sm text-text-muted">
            Console quản trị sẽ có ở phase sau. Bạn đang đăng nhập với tư cách Admin ({user.email}).
          </p>
          <Button variant="secondary" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-plum-800 px-6">
      <form
        onSubmit={handleSubmit}
        className="grid w-full max-w-sm gap-5 rounded-2xl border border-white/10 bg-white p-8 shadow-lg"
      >
        <div className="grid gap-1 text-center">
          <h1 className="text-xl font-semibold text-text-strong">Quản trị hệ thống</h1>
          <p className="text-sm text-text-muted">Đăng nhập bằng tài khoản Admin</p>
        </div>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Input
          label="Mật khẩu"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" loading={submitting} fullWidth>
          Đăng nhập
        </Button>
      </form>
    </div>
  );
}
