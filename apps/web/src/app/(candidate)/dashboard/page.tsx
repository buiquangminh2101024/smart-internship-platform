import type { Metadata } from "next";
import { CandidateDashboardClient } from "@/components/candidate/CandidateDashboardClient";

export const metadata: Metadata = {
  title: "Tổng quan — Ứng viên — InternHub",
  description: "Trung tâm quản lý tiến độ tìm việc thực tập và hồ sơ ứng viên.",
};

export default function CandidateDashboardPage() {
  return <CandidateDashboardClient />;
}
