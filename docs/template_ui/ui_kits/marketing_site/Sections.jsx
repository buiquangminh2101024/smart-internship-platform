var { Icon, Avatar, Badge, Button, Card, JobCard, Input, Select, RoleBadge, StatCard } = window.InternHubDesignSystem_f6cc55;

function Photo({ label, height = 280, style }) {
  return (
    <div style={{ height, borderRadius: "var(--radius-xl)", background: "var(--surface-sunken)", border: "var(--border-w) dashed var(--border-strong)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", color: "var(--text-subtle)", textAlign: "center", padding: "var(--space-4)", ...style }}>
      <Icon name="image" size={22} />
      <span style={{ font: "var(--type-body-sm)" }}>{label}</span>
      <span style={{ font: "var(--type-meta)" }}>Chỗ dành cho ảnh thật — chưa có tư liệu</span>
    </div>
  );
}

function SiteHeader() {
  const links = ["Việc thực tập", "Công ty", "Cẩm nang", "Dành cho doanh nghiệp"];
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.92)", backdropFilter: "var(--blur-glass)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
      <div style={{ maxWidth: "var(--layout-max)", margin: "0 auto", height: 72, display: "flex", alignItems: "center", gap: "var(--space-6)", padding: "0 var(--space-6)" }}>
        <a href="#" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <img src="../../assets/logo-mark.svg" alt="" style={{ height: 30 }} />
          <img src="../../assets/logo-wordmark.svg" alt="InternHub" style={{ height: 19 }} />
        </a>
        <nav style={{ display: "flex", gap: "var(--space-5)", flex: 1 }}>
          {links.map((l) => <a key={l} href="#" style={{ font: "var(--type-label)", color: "var(--text-body)", textDecoration: "none" }}>{l}</a>)}
        </nav>
        <Button variant="ghost" as="a" href="../candidate_web/index.html">Đăng nhập</Button>
        <Button as="a" href="../candidate_web/index.html">Tạo hồ sơ miễn phí</Button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section style={{ background: "var(--surface-brand-deep)", color: "var(--n-0)", padding: "var(--space-20) var(--space-6) var(--space-16)" }}>
      <div style={{ maxWidth: "var(--layout-max)", margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "var(--space-12)", alignItems: "center" }}>
        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--pine-200)" }}>Nền tảng thực tập cho sinh viên Việt Nam</span>
          <h1 style={{ font: "var(--type-display)", color: "var(--n-0)", letterSpacing: "var(--tracking-tight)", maxWidth: 620 }}>Kết nối thực tập, mở đầu sự nghiệp.</h1>
          <p style={{ font: "var(--type-body-lg)", color: "var(--pine-100)", maxWidth: 520 }}>
            Tin tuyển dụng thực tập từ doanh nghiệp đã xác thực, tập trung ở một nơi. Bạn theo dõi được từng hồ sơ đã gửi, từ lúc gửi tới lúc có kết quả.
          </p>
          <Card padding="sm" style={{ display: "flex", gap: "var(--space-2)", maxWidth: 620 }}>
            <Input icon="search" placeholder="Vị trí, kỹ năng hoặc công ty" style={{ flex: 1.4 }} />
            <Select options={["Tất cả khu vực", "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"]} style={{ flex: 1 }} />
            <Button icon="search">Tìm việc</Button>
          </Card>
          <div style={{ display: "flex", gap: "var(--space-6)", font: "var(--type-body-sm)", color: "var(--pine-200)" }}>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="badge-check" size={16} />1.240 doanh nghiệp đã xác thực</span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="briefcase" size={16} />3.800 tin thực tập đang mở</span>
          </div>
        </div>
        <Photo label="Ảnh: sinh viên trao đổi với nhà tuyển dụng tại ngày hội việc làm" height={360} style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.24)", color: "var(--pine-200)" }} />
      </div>
    </section>
  );
}

function Roles() {
  const roles = [
    { role: "candidate", title: "Sinh viên", body: "Tạo hồ sơ một lần, ứng tuyển nhiều nơi và theo dõi trạng thái từng hồ sơ.", points: ["Lọc theo ngành, khu vực, mức lương", "Lưu tin và nhận thông báo tin mới", "Nhắn tin trực tiếp với nhà tuyển dụng"] },
    { role: "employer", title: "Doanh nghiệp", body: "Đăng tin thực tập, quản lý hồ sơ theo từng bước tuyển dụng.", points: ["Quy trình duyệt tin linh hoạt theo công ty", "Phân quyền cho từng thành viên HR", "Xem CV và trao đổi ngay trên nền tảng"] },
    { role: "admin", title: "Quản trị nền tảng", body: "Xác thực doanh nghiệp và kiểm duyệt nội dung tin tuyển dụng.", points: ["Xác thực theo mã số thuế và giấy phép", "Hàng đợi duyệt tin với dấu hiệu cảnh báo", "Lịch sử xử lý minh bạch"] },
  ];
  return (
    <section style={{ maxWidth: "var(--layout-max)", margin: "0 auto", padding: "var(--space-16) var(--space-6)", display: "grid", gap: "var(--space-6)" }}>
      <div style={{ display: "grid", gap: "var(--space-2)", maxWidth: 640 }}>
        <h2 style={{ font: "var(--type-h1)" }}>Ba vai trò, một nền tảng</h2>
        <p style={{ font: "var(--type-body-lg)", color: "var(--text-muted)" }}>Mỗi vai trò có không gian làm việc riêng, dùng chung một vòng đời tin tuyển dụng.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--space-4)" }}>
        {roles.map((r) => (
          <Card key={r.role} padding="lg" style={{ display: "grid", gap: "var(--space-3)", alignContent: "start" }}>
            <RoleBadge role={r.role} style={{ justifySelf: "start" }} />
            <h3 style={{ font: "var(--type-h2)", fontSize: "var(--text-xl)" }}>{r.title}</h3>
            <p style={{ font: "var(--type-body)", color: "var(--text-body)" }}>{r.body}</p>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: "var(--space-2)" }}>
              {r.points.map((p) => (
                <li key={p} style={{ display: "flex", gap: "var(--space-2)", font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
                  <Icon name="check" size={16} style={{ color: "var(--pine-500)", marginTop: 2 }} />{p}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Lifecycle() {
  const steps = [["Đăng tin", "Doanh nghiệp soạn tin và gửi duyệt."], ["Kiểm duyệt", "Admin kiểm tra nội dung và doanh nghiệp."], ["Hiển thị", "Sinh viên tìm thấy và ứng tuyển."], ["Theo dõi", "Hai bên trao đổi tới khi có kết quả."]];
  return (
    <section style={{ background: "var(--surface-card)", borderTop: "var(--border-w) solid var(--border-subtle)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
      <div style={{ maxWidth: "var(--layout-max)", margin: "0 auto", padding: "var(--space-16) var(--space-6)", display: "grid", gap: "var(--space-6)" }}>
        <h2 style={{ font: "var(--type-h1)" }}>Một tin tuyển dụng đi qua bốn bước</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--space-4)" }}>
          {steps.map(([t, d], i) => (
            <div key={t} style={{ display: "grid", gap: "var(--space-2)", paddingTop: "var(--space-4)", borderTop: "var(--border-w-thick) solid var(--pine-500)" }}>
              <span style={{ font: "var(--type-mono)", color: "var(--pine-600)" }}>0{i + 1}</span>
              <span style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{t}</span>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Featured() {
  return (
    <section style={{ maxWidth: "var(--layout-max)", margin: "0 auto", padding: "var(--space-16) var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-4)" }}>
        <h2 style={{ font: "var(--type-h1)", flex: 1 }}>Tin mới trong tuần</h2>
        <Button variant="secondary" iconAfter="arrow-right" as="a" href="../candidate_web/index.html">Xem tất cả tin</Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "var(--space-3)" }}>
        {JOBS.slice(0, 4).map((j) => <JobCard key={j.id} {...j} onClick={() => {}} />)}
      </div>
    </section>
  );
}

function EmployerCta() {
  return (
    <section style={{ maxWidth: "var(--layout-max)", margin: "0 auto var(--space-16)", padding: "0 var(--space-6)" }}>
      <Card padding="lg" style={{ background: "var(--surface-brand-soft)", borderColor: "var(--pine-100)", display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "var(--space-8)", alignItems: "center", padding: "var(--space-10)" }}>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <h2 style={{ font: "var(--type-h1)", color: "var(--pine-800)" }}>Đang tìm thực tập sinh?</h2>
          <p style={{ font: "var(--type-body-lg)", color: "var(--pine-700)", maxWidth: 520 }}>Xác thực doanh nghiệp một lần, sau đó đăng tin không giới hạn trong kỳ tuyển dụng. Hồ sơ ứng viên về đúng một nơi.</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button as="a" href="../employer_portal/index.html" icon="building-2">Đăng tin tuyển dụng</Button>
            <Button variant="secondary" as="a" href="../employer_portal/index.html">Xem cách hoạt động</Button>
          </div>
        </div>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <StatCard icon="clock" label="Thời gian duyệt tin trung bình" value="8" unit="giờ" />
          <StatCard icon="users" label="Hồ sơ / tin trung bình" value="19" unit="hồ sơ" />
        </div>
      </Card>
    </section>
  );
}

function SiteFooter() {
  const cols = [
    ["Sinh viên", ["Tìm việc thực tập", "Cẩm nang viết CV", "Công ty đã xác thực"]],
    ["Doanh nghiệp", ["Đăng tin tuyển dụng", "Xác thực doanh nghiệp", "Giá dịch vụ"]],
    ["InternHub", ["Về chúng tôi", "Tuyển dụng", "Liên hệ"]],
    ["Pháp lý", ["Điều khoản sử dụng", "Chính sách dữ liệu cá nhân", "Xử lý báo cáo vi phạm"]],
  ];
  return (
    <footer style={{ background: "var(--surface-brand-deep)", color: "var(--pine-100)", padding: "var(--space-12) var(--space-6) var(--space-8)" }}>
      <div style={{ maxWidth: "var(--layout-max)", margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr repeat(4,1fr)", gap: "var(--space-8)" }}>
        <div style={{ display: "grid", gap: "var(--space-3)", alignContent: "start" }}>
          <img src="../../assets/logo-full-inverse.svg" alt="InternHub" style={{ height: 64, justifySelf: "start" }} />
          <p style={{ font: "var(--type-body-sm)", color: "var(--pine-200)", maxWidth: 280 }}>Nền tảng kết nối sinh viên và doanh nghiệp tại Việt Nam.</p>
        </div>
        {cols.map(([t, items]) => (
          <div key={t} style={{ display: "grid", gap: "var(--space-2)", alignContent: "start" }}>
            <span style={{ font: "var(--type-eyebrow)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--n-0)" }}>{t}</span>
            {items.map((i) => <a key={i} href="#" style={{ font: "var(--type-body-sm)", color: "var(--pine-200)", textDecoration: "none" }}>{i}</a>)}
          </div>
        ))}
      </div>
      <div style={{ maxWidth: "var(--layout-max)", margin: "var(--space-8) auto 0", paddingTop: "var(--space-5)", borderTop: "1px solid rgba(255,255,255,0.16)", display: "flex", justifyContent: "space-between", font: "var(--type-body-sm)", color: "var(--pine-200)" }}>
        <span>© 2026 InternHub. Kết nối thực tập, mở đầu sự nghiệp.</span>
        <span>Hà Nội · TP. Hồ Chí Minh</span>
      </div>
    </footer>
  );
}

Object.assign(window, { SiteHeader, Hero, Roles, Lifecycle, Featured, EmployerCta, SiteFooter, Photo });
