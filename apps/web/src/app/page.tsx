import type { Metadata } from "next";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { LatestJobsSection } from "@/components/marketing/LatestJobsSection";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { HeroSearchBar } from "@/components/marketing/HeroSearchBar";
import { RoleBadge } from "@/components/ui/RoleBadge";

export const metadata: Metadata = {
  title: "InternHub — Kết nối thực tập, mở đầu sự nghiệp",
  description: "Tin tuyển dụng thực tập từ doanh nghiệp đã xác thực, tập trung ở một nơi.",
};

const ROLES = [
  {
    role: "candidate" as const,
    title: "Sinh viên",
    body: "Tạo hồ sơ một lần, ứng tuyển nhiều nơi và theo dõi trạng thái từng hồ sơ.",
    points: ["Lọc theo ngành, khu vực, mức lương", "Lưu tin và nhận thông báo tin mới", "Nhắn tin trực tiếp với nhà tuyển dụng"],
  },
  {
    role: "employer" as const,
    title: "Doanh nghiệp",
    body: "Đăng tin thực tập, quản lý hồ sơ theo từng bước tuyển dụng.",
    points: ["Quy trình duyệt tin linh hoạt theo công ty", "Phân quyền cho từng thành viên HR", "Xem CV và trao đổi ngay trên nền tảng"],
  },
  {
    role: "admin" as const,
    title: "Quản trị nền tảng",
    body: "Xác thực doanh nghiệp và kiểm duyệt nội dung tin tuyển dụng.",
    points: ["Xác thực theo mã số thuế và giấy phép", "Hàng đợi duyệt tin với dấu hiệu cảnh báo", "Lịch sử xử lý minh bạch"],
  },
];

const LIFECYCLE_STEPS = [
  ["Đăng tin", "Doanh nghiệp soạn tin và gửi duyệt."],
  ["Kiểm duyệt", "Admin kiểm tra nội dung và doanh nghiệp."],
  ["Hiển thị", "Sinh viên tìm thấy và ứng tuyển."],
  ["Theo dõi", "Hai bên trao đổi tới khi có kết quả."],
];

export default function CandidateHomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <CandidateHomeHeader />

      {/* Light Editorial Hero */}
      <section className="relative overflow-hidden border-b border-border-subtle bg-white px-6 py-16 lg:py-24">
        <div className="dot-pattern pointer-events-none absolute inset-0 opacity-45" />
        <div className="pointer-events-none absolute -top-40 right-0 h-[520px] w-[520px] rounded-full bg-brand-50/80 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-12">
          <div className="grid gap-6 lg:col-span-7">
            <span className="animate-fade-up inline-flex w-fit items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              Nền tảng thực tập cho sinh viên Việt Nam
            </span>

            <h1 className="animate-fade-up max-w-2xl text-4xl font-extrabold tracking-tight text-text-strong sm:text-5xl sm:leading-[1.15]">
              Tìm nơi thực tập xứng tầm,{" "}
              <span className="text-brand-500">theo dõi rõ</span> từng bước tuyển dụng.
            </h1>

            <p className="animate-fade-up max-w-xl text-base leading-relaxed text-text-muted sm:text-[17px]">
              Tin tuyển dụng thực tập từ doanh nghiệp đã xác thực, tập trung ở một nơi. Bạn theo dõi được từng hồ sơ đã
              gửi, từ lúc gửi CV tới lúc nhận kết quả phỏng vấn.
            </p>

            <div className="animate-fade-up">
              <HeroSearchBar />
            </div>

            <div className="animate-fade-up flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm font-medium text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="badge-check" size={16} className="text-success-600" />
                1.240+ doanh nghiệp đã xác thực
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="briefcase" size={16} className="text-brand-500" />
                3.800+ tin thực tập đang mở
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="clock" size={16} className="text-amber-600" />
                Phản hồi trung bình 4,2 ngày
              </span>
            </div>
          </div>

          {/* Layered Floating Product Preview Card */}
          <div className="relative hidden lg:col-span-5 lg:block">
            <div className="absolute -top-4 -right-4 -z-10 h-full w-full rounded-2xl border border-border-subtle bg-surface-page" />
            <div className="grid gap-5 rounded-2xl border border-border-default bg-white p-6 shadow-[0_20px_48px_-12px_rgba(13,17,23,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-sm font-extrabold text-brand-700">
                    VN
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold text-text-strong">VNG Corporation</span>
                      <Icon name="badge-check" size={15} className="text-brand-500" />
                    </div>
                    <p className="text-xs text-text-muted">Thực tập sinh Frontend · Quận 7, TP.HCM</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Đang mở đơn
                </span>
              </div>

              <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface-page p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-strong">Tiến trình hồ sơ minh bạch</span>
                  <span className="font-mono font-semibold text-brand-600">Theo thời gian thực</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="grid gap-1.5">
                    <span className="h-1.5 rounded-full bg-brand-500" />
                    <span className="text-[11px] font-semibold text-text-strong">Đã nộp CV</span>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="h-1.5 rounded-full bg-brand-500" />
                    <span className="text-[11px] font-semibold text-text-strong">HR đã xem</span>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="h-1.5 rounded-full bg-amber-500" />
                    <span className="text-[11px] font-bold text-amber-700">Phỏng vấn</span>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="h-1.5 rounded-full bg-border-default" />
                    <span className="text-[11px] text-text-subtle">Kết quả</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border-subtle bg-white p-3.5">
                  <span className="font-mono text-2xl font-extrabold text-text-strong">1.2K+</span>
                  <span className="mt-0.5 block text-xs text-text-muted">Doanh nghiệp xác thực</span>
                </div>
                <div className="rounded-xl border border-border-subtle bg-white p-3.5">
                  <span className="font-mono text-2xl font-extrabold text-brand-600">85%</span>
                  <span className="mt-0.5 block text-xs text-text-muted">Tỉ lệ nhận phản hồi</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-16">
        <div className="grid max-w-2xl gap-2">
          <span className="text-xs font-bold tracking-wider text-brand-600 uppercase">Kiến trúc đa vai trò</span>
          <h2 className="text-2xl font-extrabold tracking-tight text-text-strong sm:text-3xl">Ba vai trò, một nền tảng</h2>
          <p className="text-base text-text-muted">Mỗi vai trò có không gian làm việc riêng, dùng chung một vòng đời tin tuyển dụng.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {ROLES.map((r) => (
            <Card key={r.role} padding="lg" interactive className="grid content-start gap-3.5">
              <RoleBadge role={r.role} className="justify-self-start" />
              <h3 className="text-xl font-bold text-text-strong">{r.title}</h3>
              <p className="text-[15px] leading-relaxed text-text-body">{r.body}</p>
              <ul className="grid gap-2.5 pt-1">
                {r.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm text-text-muted">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-brand-500" />
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border-subtle bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16">
          <div>
            <span className="text-xs font-bold tracking-wider text-brand-600 uppercase">Quy trình minh bạch</span>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-text-strong sm:text-3xl">
              Một tin tuyển dụng đi qua bốn bước
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {LIFECYCLE_STEPS.map(([title, desc], i) => (
              <div key={title} className="grid gap-2 border-t-2 border-brand-500 pt-4">
                <span className="font-mono text-sm font-bold text-brand-600">0{i + 1}</span>
                <span className="text-lg font-bold text-text-strong">{title}</span>
                <span className="text-sm leading-relaxed text-text-muted">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LatestJobsSection />

      <section className="mx-auto w-full max-w-7xl px-6 pb-16">
        <Card padding="lg" tone="solid" className="grid items-center gap-8 border-none bg-[#0d1117] md:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4">
            <span className="text-xs font-bold tracking-wider text-brand-300 uppercase">Dành cho Doanh nghiệp</span>
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">Đang tìm thực tập sinh?</h2>
            <p className="max-w-lg text-base leading-relaxed text-slate-300">
              Xác thực doanh nghiệp một lần, sau đó đăng tin trong kỳ tuyển dụng. Hồ sơ ứng viên về đúng một nơi.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button as="a" href="/employer" icon="building-2">
                Đăng tin tuyển dụng
              </Button>
              <Button as="a" href="/employer" variant="secondary">
                Xem cách hoạt động
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <span className="font-mono text-3xl font-extrabold text-white">8 giờ</span>
              <span className="mt-1 block text-sm text-slate-300">Thời gian duyệt tin trung bình</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <span className="font-mono text-3xl font-extrabold text-brand-300">19 hồ sơ</span>
              <span className="mt-1 block text-sm text-slate-300">Hồ sơ / tin trung bình</span>
            </div>
          </div>
        </Card>
      </section>

      <SiteFooter />
    </div>
  );
}
