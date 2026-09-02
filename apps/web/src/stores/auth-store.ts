import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokensResponse, UserProfile } from "@sip/shared-types";
import { clearRoleCookie, setRoleCookie } from "@/lib/auth-storage";

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** true sau khi zustand persist đọc xong localStorage phía client (xem SessionSync). */
  hasHydrated: boolean;
  setSession: (tokens: AuthTokensResponse, user: UserProfile) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: UserProfile) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,
      setSession: (tokens, user) => {
        setRoleCookie(user.role);
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => {
        setRoleCookie(user.role);
        set({ user });
      },
      clear: () => {
        clearRoleCookie();
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: "sip-auth",
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken, refreshToken: state.refreshToken }),
    },
  ),
);

// localStorage là API đồng bộ nên persist rehydrate xong ngay trong lúc create()
// ở trên còn đang chạy — không thể set `hasHydrated` từ bên trong config/option
// của persist (khi đó biến `useAuthStore` chưa gán xong, tham chiếu ngược vào nó
// ném ReferenceError bị nuốt âm thầm, hasHydrated kẹt mãi ở false). Đăng ký ở đây,
// sau khi `useAuthStore` đã gán xong; check hasHydrated() ngay để phòng trường hợp
// rehydrate đã chạy xong trước khi listener kịp đăng ký.
// `useAuthStore.persist` chỉ tồn tại ở client — trên server (SSR) không có
// window/localStorage nên middleware persist bỏ qua hẳn việc setup nó.
if (typeof window !== "undefined") {
  useAuthStore.persist.onFinishHydration(() => {
    useAuthStore.setState({ hasHydrated: true });
  });
  if (useAuthStore.persist.hasHydrated()) {
    useAuthStore.setState({ hasHydrated: true });
  }
}

export const useCurrentUser = (): UserProfile | null => useAuthStore((s) => s.user);
export const useIsAuthenticated = (): boolean => useAuthStore((s) => !!s.accessToken);
