import type { Metadata } from "next";
import { EmployerHomeHeader } from "@/components/marketing/EmployerHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatCard } from "@/components/ui/StatCard";

export const metadata: Metadata = {
  title: "InternHub cho Doanh nghiệp — Tuyển thực tập sinh",
  description: "Đăng tin tuyển dụng thực tập sinh, tiếp cận ứng viên đã xác thực trên InternHub.",
};

const VALUE_PROPS = [
  {
    icon: "badge-check",
    title: "Ứng viên đã xác thực",
    body: "Sinh viên tạo hồ sơ đầy đủ trước khi ứng tuyển, không còn hồ sơ ảo hay thông tin thiếu.",
  },
  {
    icon: "shield-check",
    title: "Quy trình duyệt rõ ràng",
    body: "Mỗi tin tuyển dụng đi qua kiểm duyệt minh bạch, có lịch sử xử lý và lý do khi từ chối.",
  },
  {
    icon: "message-circle",
    title: "Nhắn tin trực tiếp",
    body: "Trao đổi với ứng viên ngay trên nền tảng, không cần chuyển sang email hay Zalo.",
  },
];

const LIFECYCLE_STEPS = [
  ["Đăng tin", "Soạn tin tuyển dụng và gửi duyệt chỉ trong vài phút."],
  ["Kiểm duyệt", "Admin kiểm tra nội dung, thường trong 8 giờ."],
  ["Nhận hồ sơ", "Ứng viên phù hợp chủ động ứng tuyển vào tin của bạn."],
  ["Tuyển chọn", "Xem CV, trao đổi và chốt kết quả ngay trên nền tảng."],
];

export default function EmployerHomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <EmployerHomeHeader />

      <section className="bg-indigo-50 px-6 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-5">
            <span className="text-xs font-semibold tracking-widest text-indigo-700 uppercase">
              Dành cho nhà tuyển dụng
            </span>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-text-strong md:text-5xl">
              Tuyển thực tập sinh chất lượng, nhanh chóng.
            </h1>
            <p className="max-w-lg text-lg text-text-body">
              Xác thực doanh nghiệp một lần, sau đó đăng tin không giới hạn. Hồ sơ ứng viên tập trung về một nơi, xét
              duyệt ngay trên nền tảng.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button as="a" href="/register?role=EMPLOYER" icon="building-2" className="!bg-indigo-600 hover:!bg-indigo-700">
                Đăng tin tuyển dụng
              </Button>
              <Button as="a" href="#cach-hoat-dong" variant="secondary">
                Xem cách hoạt động
              </Button>
            </div>
          </div>
          <div className="hidden h-[360px] items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-white text-center text-sm text-indigo-400 md:flex">
            Ảnh: đội ngũ HR phỏng vấn ứng viên thực tập
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-16">
        <div className="grid max-w-xl gap-2">
          <h2 className="text-2xl font-semibold text-text-strong">Vì sao doanh nghiệp chọn InternHub</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {VALUE_PROPS.map((v) => (
            <Card key={v.title} padding="lg" className="grid content-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <Icon name={v.icon} size={20} />
              </span>
              <h3 className="text-lg font-semibold text-text-strong">{v.title}</h3>
              <p className="text-text-muted">{v.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="cach-hoat-dong" className="border-y border-border-subtle bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16">
          <h2 className="text-2xl font-semibold text-text-strong">Từ đăng tin tới tuyển chọn, chỉ bốn bước</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {LIFECYCLE_STEPS.map(([title, desc], i) => (
              <div key={title} className="grid gap-2 border-t-2 border-indigo-500 pt-4">
                <span className="font-mono text-sm text-indigo-600">0{i + 1}</span>
                <span className="text-lg font-semibold text-text-strong">{title}</span>
                <span className="text-sm text-text-muted">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-16 md:grid-cols-3">
        <StatCard icon="badge-check" label="Doanh nghiệp đã xác thực" value="1.240" />
        <StatCard icon="clock" label="Thời gian duyệt tin trung bình" value="8" unit="giờ" />
        <StatCard icon="users" label="Hồ sơ / tin trung bình" value="19" unit="hồ sơ" />
      </section>

      <SiteFooter />
    </div>
  );
}
