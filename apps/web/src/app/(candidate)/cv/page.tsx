import type { Metadata } from "next";

export const metadata: Metadata = { title: "CV — InternHub" };

export default function CvPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 text-center">
      <p className="text-text-muted">Trang quản lý CV sẽ có ở Phase 6.</p>
    </main>
  );
}
