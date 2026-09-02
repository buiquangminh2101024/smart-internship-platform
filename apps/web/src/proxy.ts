// Next.js 16 đổi tên file quy ước middleware.js → proxy.js (xem
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Chặn route theo actor dựa theo bảng ở AD-1
// (docs/02-architecture/ARCHITECTURE_DECISIONS.md). Token thật (access/refresh)
// nằm ở localStorage (AD-2) nên proxy — chạy phía server — không đọc được;
// thay vào đó đọc cookie `sip_role` (chỉ chứa role, không nhạy cảm) được
// stores/auth-store.ts ghi song song mỗi khi đăng nhập/đăng xuất
// (xem lib/auth-storage.ts).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROLE_COOKIE_NAME = "sip_role";

const CANDIDATE_ONLY_PREFIXES = ["/profile", "/cv", "/applications", "/saved-jobs", "/messages"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get(ROLE_COOKIE_NAME)?.value;

  if (CANDIDATE_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (role !== "CANDIDATE") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname !== "/employer" && pathname.startsWith("/employer/")) {
    if (role !== "EMPLOYER") {
      return NextResponse.redirect(new URL("/employer", request.url));
    }
    return NextResponse.next();
  }

  if (pathname !== "/admin" && pathname.startsWith("/admin/")) {
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
