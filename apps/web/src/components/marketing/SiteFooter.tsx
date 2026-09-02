const COLUMNS = [
  { title: "Sinh viên", items: ["Tìm việc thực tập", "Cẩm nang viết CV", "Công ty đã xác thực"] },
  { title: "Doanh nghiệp", items: ["Đăng tin tuyển dụng", "Xác thực doanh nghiệp", "Giá dịch vụ"] },
  { title: "InternHub", items: ["Về chúng tôi", "Tuyển dụng", "Liên hệ"] },
  { title: "Pháp lý", items: ["Điều khoản sử dụng", "Chính sách dữ liệu cá nhân", "Xử lý báo cáo vi phạm"] },
];

export function SiteFooter() {
  return (
    <footer className="bg-surface-brand-deep px-6 py-12 text-pine-100">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 md:grid-cols-5">
        <div className="col-span-2 grid content-start gap-3">
          <span className="text-lg font-semibold text-white">InternHub</span>
          <p className="max-w-xs text-sm text-pine-200">Nền tảng kết nối sinh viên và doanh nghiệp tại Việt Nam.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="grid content-start gap-2">
            <span className="text-xs font-semibold tracking-wide text-white uppercase">{col.title}</span>
            {col.items.map((item) => (
              <a key={item} href="#" className="text-sm text-pine-200 hover:text-white">
                {item}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-2 border-t border-white/15 pt-5 text-sm text-pine-200 sm:flex-row sm:justify-between">
        <span>© 2026 InternHub. Kết nối thực tập, mở đầu sự nghiệp.</span>
        <span>Hà Nội · TP. Hồ Chí Minh</span>
      </div>
    </footer>
  );
}
