import Link from "next/link";

// Mục chưa có trang thật để `href="#"`; mục có `href` thì là link thật.
const ITEM_HREF: Record<string, string> = { "Liên hệ hỗ trợ": "/support" };

const COLUMNS = [
  { title: "Sinh viên", items: ["Tìm việc thực tập", "Cẩm nang viết CV", "Công ty đã xác thực"] },
  { title: "Doanh nghiệp", items: ["Đăng tin tuyển dụng", "Xác thực doanh nghiệp", "Giá dịch vụ"] },
  { title: "InternHub", items: ["Về chúng tôi", "Tuyển dụng", "Liên hệ hỗ trợ"] },
  { title: "Pháp lý", items: ["Điều khoản sử dụng", "Chính sách dữ liệu cá nhân", "Xử lý báo cáo vi phạm"] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border-subtle bg-[#0d1117] px-6 py-14 text-slate-300">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 md:grid-cols-5">
        <div className="col-span-2 grid content-start gap-3">
          <span className="text-xl font-extrabold tracking-tight text-white">
            Intern<span className="text-brand-400">Hub</span>
          </span>
          <p className="max-w-xs text-[15px] leading-relaxed text-slate-400">
            Nền tảng kết nối sinh viên thực tập và doanh nghiệp đã xác thực tại Việt Nam.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="grid content-start gap-2.5">
            <span className="text-xs font-bold tracking-wider text-white uppercase">{col.title}</span>
            {col.items.map((item) =>
              ITEM_HREF[item] ? (
                <Link key={item} href={ITEM_HREF[item]} className="text-sm text-slate-400 transition-colors hover:text-white">
                  {item}
                </Link>
              ) : (
                <a key={item} href="#" className="text-sm text-slate-400 transition-colors hover:text-white">
                  {item}
                </a>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-2 border-t border-white/10 pt-6 text-sm text-slate-400 sm:flex-row sm:justify-between">
        <span>© 2026 InternHub. Kết nối thực tập, mở đầu sự nghiệp.</span>
        <span>Hà Nội · TP. Hồ Chí Minh</span>
      </div>
    </footer>
  );
}
