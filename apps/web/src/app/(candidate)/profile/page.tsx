import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hồ sơ — InternHub" };

export default function ProfilePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 text-center">
      <p className="text-text-muted">Trang hồ sơ ứng viên sẽ có ở Phase 3.</p>
    </main>
  );
}
