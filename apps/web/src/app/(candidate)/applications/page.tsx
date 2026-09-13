import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ứng tuyển của tôi — InternHub" };

export default function ApplicationsPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6 text-center">
      <p className="text-text-muted">Trang theo dõi ứng tuyển sẽ có ở Phase 8.</p>
    </div>
  );
}

