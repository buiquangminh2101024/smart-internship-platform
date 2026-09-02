import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tin nhắn — InternHub" };

export default function MessagesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 text-center">
      <p className="text-text-muted">Trang nhắn tin sẽ có ở Phase 8.</p>
    </main>
  );
}
