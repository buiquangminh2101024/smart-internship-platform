// Next.js 16 đổi tên file quy ước middleware.js → proxy.js (xem
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Chặn route theo actor dựa theo bảng ở AD-1
// (docs/02-architecture/ARCHITECTURE_DECISIONS.md). Token thật (access/refresh)
// nằm ở localStorage (AD-2) nên proxy — chạy phía server — không đọc được;
// thay vào đó đọc cookie đánh dấu phiên riêng theo area (AD-4) được
// stores/auth-store.ts ghi song song mỗi khi đăng nhập/đăng xuất
// (xem lib/auth-storage.ts). Mỗi area có cookie riêng — không dùng chung 1
// cookie để tránh phiên của area này bị coi là hợp lệ ở area khác.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CANDIDATE_SESSION_COOKIE = "sip_session_candidate";
const EMPLOYER_SESSION_COOKIE = "sip_session_employer";
const ADMIN_SESSION_COOKIE = "sip_session_admin";

const CANDIDATE_ONLY_PREFIXES = ["/profile", "/cv", "/applications", "/saved-jobs", "/messages"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (CANDIDATE_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (!request.cookies.get(CANDIDATE_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname !== "/employer" && pathname.startsWith("/employer/")) {
    if (!request.cookies.get(EMPLOYER_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/employer", request.url));
    }
    return NextResponse.next();
  }

  if (pathname !== "/admin" && pathname.startsWith("/admin/")) {
    if (!request.cookies.get(ADMIN_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
