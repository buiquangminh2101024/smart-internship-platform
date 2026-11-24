import type { Metadata } from "next";
import type { SupportCategory } from "@sip/shared-types";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SupportContactForm } from "@/components/support/SupportContactForm";

export const metadata: Metadata = { title: "Liên hệ hỗ trợ — InternHub" };

interface SupportPageProps {
  searchParams: Promise<{ category?: string | string[]; email?: string | string[]; message?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Trang hỗ trợ bản A (AD-17): công khai, người bị khoá tài khoản vẫn gửi được.
 * `LoginForm` dẫn tới đây với `?category=ACCOUNT_SUSPENDED&email=…` để điền sẵn. Form nhập OTP
 * mãi không được (AD-31 D7) dẫn tới với `?category=OTHER&email=…&message=…`.
 */
export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = await searchParams;
  const category: SupportCategory = firstParam(params.category) === "ACCOUNT_SUSPENDED" ? "ACCOUNT_SUSPENDED" : "OTHER";
  const email = firstParam(params.email).trim().slice(0, 254);
  // Khớp giới hạn 2.000 ký tự của server; người dùng vẫn sửa được trước khi gửi.
  const message = firstParam(params.message).trim().slice(0, 2000);

  return (
    <div className="flex min-h-screen flex-col">
      <CandidateHomeHeader />

      <main className="mx-auto grid w-full max-w-2xl flex-1 content-start gap-6 px-4 py-10 sm:px-6">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold text-text-strong">Liên hệ hỗ trợ</h1>
          <p className="text-sm text-text-muted">
            Gửi câu hỏi hoặc yêu cầu tới quản trị viên InternHub. Bạn nhận phản hồi qua email.
          </p>
        </div>
        <SupportContactForm initialEmail={email} initialCategory={category} initialMessage={message} />
      </main>

      <SiteFooter />
    </div>
  );
}
