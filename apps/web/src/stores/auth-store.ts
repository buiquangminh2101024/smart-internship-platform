import { create, type Mutate, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokensResponse, UserProfile } from "@sip/shared-types";
import { AREA_HOME, areaForPath, type AuthArea } from "@/lib/auth-area";
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

type PersistedAuthState = Pick<AuthState, "user" | "accessToken" | "refreshToken">;
type AuthStore = UseBoundStore<Mutate<StoreApi<AuthState>, [["zustand/persist", PersistedAuthState]]>>;

// Mỗi area (candidate/employer/admin) có store + localStorage key + cookie
// riêng — không đọc chéo nhau (xem AD-4,
// docs/02-architecture/ARCHITECTURE_DECISIONS.md). Cookie/clear của store
// luôn theo đúng area của chính nó, không còn suy từ `user.role` như trước.
// localStorage và cookie dùng chung cho mọi tab, nên các tab còn phải đồng bộ
// phiên với nhau qua sự kiện `storage` (AD-22).
function storageKeyOf(area: AuthArea): string {
  return `sip-auth-${area}`;
}

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
        name: storageKeyOf(area),
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
    // Chỉ set lần đầu: rehydrate lại về sau (AD-22) không cần ghi ngược state ra localStorage.
    store.persist.onFinishHydration(() => {
      if (!store.getState().hasHydrated) store.setState({ hasHydrated: true });
    });
    if (store.persist.hasHydrated()) {
      store.setState({ hasHydrated: true });
    }
    // Sự kiện `storage` chỉ tới các tab KHÁC tab vừa ghi; `key === null` là localStorage.clear().
    window.addEventListener("storage", (event) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === storageKeyOf(area) || event.key === null) syncFromOtherTab(area, store);
    });
  }

  return store;
}

/**
 * AD-22 — Tab khác vừa đổi phiên của `area` (đăng nhập lại, đăng xuất, refresh
 * access token): nạp lại bản trong localStorage để mọi tab giữ cùng một phiên.
 * Trước đây mỗi tab giữ bản sao chụp lúc tải trang; bản cũ bị server từ chối
 * thì tab đó xoá phiên — xoá luôn phiên mới của tab vừa đăng nhập lại.
 *
 * Phiên kết thúc hoặc đổi sang tài khoản khác trong khi tab này đang ở đúng
 * khu vực đó ⇒ về trang chủ khu vực (tải lại trang, như `endSession` của
 * api-client) để không còn hiện dữ liệu của phiên cũ. Ở khu vực khác thì chỉ
 * cập nhật âm thầm.
 */
function syncFromOtherTab(area: AuthArea, store: AuthStore): void {
  const previousUserId = store.getState().user?.id ?? null;
  if (window.localStorage.getItem(storageKeyOf(area)) === null) {
    store.getState().clear();
  } else {
    // localStorage là API đồng bộ nên rehydrate xong ngay sau dòng này.
    void store.persist.rehydrate();
  }
  const userId = store.getState().user?.id ?? null;
  if (previousUserId !== null && userId !== previousUserId && areaForPath(window.location.pathname) === area) {
    window.location.assign(AREA_HOME[area]);
  }
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

/**
 * AD-22 — Refresh token mới nhất của `area`, đọc lại từ localStorage chứ không
 * dùng bản tab này đang giữ: tab khác có thể vừa đăng nhập lại mà sự kiện
 * `storage` chưa kịp tới (vd. đúng lúc tab được focus lại).
 */
export function latestRefreshToken(area: AuthArea): string | null {
  const store = STORES_BY_AREA[area];
  if (typeof window !== "undefined") void store.persist.rehydrate();
  return store.getState().refreshToken;
}

export const useCurrentUser = (area: AuthArea): UserProfile | null => authStoreForArea(area)((s) => s.user);
export const useIsAuthenticated = (area: AuthArea): boolean => authStoreForArea(area)((s) => !!s.accessToken);
