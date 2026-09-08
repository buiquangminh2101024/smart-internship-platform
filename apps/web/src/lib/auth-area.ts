import type { Role } from "@sip/shared-types";

// Ngữ cảnh auth độc lập theo actor — xem AD-4 (docs/02-architecture/ARCHITECTURE_DECISIONS.md).
// Mỗi area có store/cookie/localStorage key riêng, không đọc chéo nhau.
export type AuthArea = "candidate" | "employer" | "admin";

export function areaForRole(role: Role): AuthArea {
  if (role === "EMPLOYER") return "employer";
  if (role === "ADMIN") return "admin";
  return "candidate";
}

export const AREA_HOME: Record<AuthArea, string> = {
  candidate: "/",
  employer: "/employer",
  admin: "/admin",
};
