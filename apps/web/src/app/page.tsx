import type { Metadata } from "next";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { JobCard } from "@/components/ui/JobCard";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Select } from "@/components/ui/Select";
import { SAMPLE_JOBS } from "@/lib/sample-jobs";

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

      <section className="bg-surface-brand-deep px-6 py-20 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-5">
            <span className="text-xs font-semibold tracking-widest text-pine-200 uppercase">
              Nền tảng thực tập cho sinh viên Việt Nam
            </span>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight md:text-5xl">
              Kết nối thực tập, mở đầu sự nghiệp.
            </h1>
            <p className="max-w-lg text-lg text-pine-100">
              Tin tuyển dụng thực tập từ doanh nghiệp đã xác thực, tập trung ở một nơi. Bạn theo dõi được từng hồ sơ
              đã gửi, từ lúc gửi tới lúc có kết quả.
            </p>
            <Card padding="sm" className="flex max-w-xl flex-col gap-2 sm:flex-row">
              <Input icon="search" placeholder="Vị trí, kỹ năng hoặc công ty" className="flex-[1.4]" />
              <Select
                options={["Tất cả khu vực", "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"]}
                className="flex-1"
              />
              <Button as="a" href="/register" icon="search">
                Tìm việc
              </Button>
            </Card>
            <div className="flex flex-wrap gap-6 text-sm text-pine-200">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="badge-check" size={16} />
                1.240 doanh nghiệp đã xác thực
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="briefcase" size={16} />
                3.800 tin thực tập đang mở
              </span>
            </div>
          </div>
          <div className="hidden h-[360px] items-center justify-center rounded-xl border border-dashed border-white/25 bg-white/5 text-center text-sm text-pine-200 md:flex">
            Ảnh: sinh viên trao đổi với nhà tuyển dụng tại ngày hội việc làm
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-16">
        <div className="grid max-w-xl gap-2">
          <h2 className="text-2xl font-semibold text-text-strong">Ba vai trò, một nền tảng</h2>
          <p className="text-lg text-text-muted">Mỗi vai trò có không gian làm việc riêng, dùng chung một vòng đời tin tuyển dụng.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((r) => (
            <Card key={r.role} padding="lg" className="grid content-start gap-3">
              <RoleBadge role={r.role} className="justify-self-start" />
              <h3 className="text-xl font-semibold text-text-strong">{r.title}</h3>
              <p className="text-text-body">{r.body}</p>
              <ul className="grid gap-2">
                {r.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-text-muted">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-pine-500" />
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border-subtle bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16">
          <h2 className="text-2xl font-semibold text-text-strong">Một tin tuyển dụng đi qua bốn bước</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {LIFECYCLE_STEPS.map(([title, desc], i) => (
              <div key={title} className="grid gap-2 border-t-2 border-pine-500 pt-4">
                <span className="font-mono text-sm text-pine-600">0{i + 1}</span>
                <span className="text-lg font-semibold text-text-strong">{title}</span>
                <span className="text-sm text-text-muted">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-6 py-16">
        <div className="flex items-end gap-4">
          <h2 className="flex-1 text-2xl font-semibold text-text-strong">Tin mới trong tuần</h2>
          <Button as="a" href="/register" variant="secondary" iconAfter="arrow-right">
            Xem tất cả tin
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SAMPLE_JOBS.map((job) => (
            <JobCard key={job.id} {...job} />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <Card padding="lg" tone="brand" className="grid items-center gap-8 md:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-3">
            <h2 className="text-2xl font-semibold text-pine-800">Đang tìm thực tập sinh?</h2>
            <p className="max-w-lg text-lg text-pine-700">
              Xác thực doanh nghiệp một lần, sau đó đăng tin không giới hạn trong kỳ tuyển dụng. Hồ sơ ứng viên về
              đúng một nơi.
            </p>
            <div className="flex gap-2">
              <Button as="a" href="/employer" icon="building-2">
                Đăng tin tuyển dụng
              </Button>
              <Button as="a" href="/employer" variant="secondary">
                Xem cách hoạt động
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-xl border border-pine-100 bg-white p-4">
              <span className="block text-2xl font-semibold text-text-strong">8 giờ</span>
              <span className="text-sm text-text-muted">Thời gian duyệt tin trung bình</span>
            </div>
            <div className="rounded-xl border border-pine-100 bg-white p-4">
              <span className="block text-2xl font-semibold text-text-strong">19 hồ sơ</span>
              <span className="text-sm text-text-muted">Hồ sơ / tin trung bình</span>
            </div>
          </div>
        </Card>
      </section>

      <SiteFooter />
    </div>
  );
}
