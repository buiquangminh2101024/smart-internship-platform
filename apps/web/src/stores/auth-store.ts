import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokensResponse, UserProfile } from "@sip/shared-types";
import type { AuthArea } from "@/lib/auth-area";
import { clearAreaCookie, setAreaCookie } from "@/lib/auth-storage";

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

type AuthStore = UseBoundStore<StoreApi<AuthState>>;

// Mỗi area (candidate/employer/admin) có store + localStorage key + cookie
// riêng — không đọc chéo nhau (xem AD-4,
// docs/02-architecture/ARCHITECTURE_DECISIONS.md). Cookie/clear của store
// luôn theo đúng area của chính nó, không còn suy từ `user.role` như trước.
function createAuthStore(area: AuthArea): AuthStore {
  const store = create<AuthState>()(
    persist(
      (set) => ({
        user: null,
        accessToken: null,
        refreshToken: null,
        hasHydrated: false,
        setSession: (tokens, user) => {
          setAreaCookie(area);
          set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user });
        },
        setAccessToken: (accessToken) => set({ accessToken }),
        setUser: (user) => set({ user }),
        clear: () => {
          clearAreaCookie(area);
          set({ user: null, accessToken: null, refreshToken: null });
        },
      }),
      {
        name: `sip-auth-${area}`,
        partialize: (state) => ({ user: state.user, accessToken: state.accessToken, refreshToken: state.refreshToken }),
      },
    ),
  );

  // localStorage là API đồng bộ nên persist rehydrate xong ngay trong lúc create()
  // ở trên còn đang chạy — không thể set `hasHydrated` từ bên trong config/option
  // của persist (khi đó biến `store` chưa gán xong, tham chiếu ngược vào nó
  // ném ReferenceError bị nuốt âm thầm, hasHydrated kẹt mãi ở false). Đăng ký ở
  // đây, sau khi `store` đã gán xong; check hasHydrated() ngay để phòng trường
  // hợp rehydrate đã chạy xong trước khi listener kịp đăng ký.
  // `store.persist` chỉ tồn tại ở client — trên server (SSR) không có
  // window/localStorage nên middleware persist bỏ qua hẳn việc setup nó.
  if (typeof window !== "undefined") {
    store.persist.onFinishHydration(() => {
      store.setState({ hasHydrated: true });
    });
    if (store.persist.hasHydrated()) {
      store.setState({ hasHydrated: true });
    }
  }

  return store;
}

export const useCandidateAuthStore = createAuthStore("candidate");
export const useEmployerAuthStore = createAuthStore("employer");
export const useAdminAuthStore = createAuthStore("admin");

const STORES_BY_AREA: Record<AuthArea, AuthStore> = {
  candidate: useCandidateAuthStore,
  employer: useEmployerAuthStore,
  admin: useAdminAuthStore,
};

export function authStoreForArea(area: AuthArea): AuthStore {
  return STORES_BY_AREA[area];
}

export const useCurrentUser = (area: AuthArea): UserProfile | null => authStoreForArea(area)((s) => s.user);
export const useIsAuthenticated = (area: AuthArea): boolean => authStoreForArea(area)((s) => !!s.accessToken);
