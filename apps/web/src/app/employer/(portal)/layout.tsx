import type { ReactNode } from "react";
import { EmployerPortalShell } from "@/components/layout/EmployerPortalShell";

/**
 * Sidebar + topbar cho portal Employer. Các trang một chiều (onboarding
 * `hoan-tat-thu-tuc`, trang trả về từ MoMo/VNPay) nằm ở route group
 * `employer/(standalone)` nên cố tình KHÔNG nhận layout này — có sidebar ở đó
 * sẽ mời người dùng thoát giữa luồng, trái với `OnboardingExitGuard`.
 */
export default function EmployerPortalLayout({ children }: { children: ReactNode }) {
  return <EmployerPortalShell>{children}</EmployerPortalShell>;
}
