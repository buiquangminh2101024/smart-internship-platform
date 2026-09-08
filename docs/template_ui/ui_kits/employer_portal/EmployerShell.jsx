var { Icon, Avatar, Badge, Button, IconButton, Card, StatusPill, StatCard, Tabs, Input, Select, Textarea, Checkbox, Switch, EmptyState, Toast, JobCard, Pagination } = window.InternHubDesignSystem_f6cc55;

var POSTS = [
  { id: 101, title: "Thực tập sinh Frontend (ReactJS)", status: "published", location: "Hà Nội", salary: "4 – 6 triệu / tháng", deadline: "Còn 12 ngày", views: 1284, apps: 26, updated: "01/09/2026" },
  { id: 102, title: "Thực tập sinh Kiểm thử phần mềm", status: "review", location: "Hà Nội", salary: "Thỏa thuận", deadline: "Hạn 30/09/2026", views: 0, apps: 0, updated: "02/09/2026" },
  { id: 103, title: "Thực tập sinh Phân tích dữ liệu", status: "draft", location: "Đà Nẵng", salary: "5 triệu / tháng", deadline: "Chưa đặt hạn", views: 0, apps: 0, updated: "31/08/2026" },
  { id: 104, title: "Thực tập sinh DevOps", status: "published", location: "TP. Hồ Chí Minh", salary: "6 – 8 triệu / tháng", deadline: "Còn 3 ngày", views: 842, apps: 14, updated: "28/08/2026" },
  { id: 105, title: "Thực tập sinh Business Analyst", status: "expired", location: "Hà Nội", salary: "4 triệu / tháng", deadline: "Hết hạn 20/08/2026", views: 2103, apps: 41, updated: "20/08/2026" },
  { id: 106, title: "Thực tập sinh Thiết kế UI", status: "takendown", location: "Hà Nội", salary: "Thỏa thuận", deadline: "Đã hạ 15/08/2026", views: 311, apps: 5, updated: "15/08/2026" },
];

var CANDIDATES = [
  { id: 201, name: "Nguyễn Minh Anh", school: "ĐH Bách khoa Hà Nội", year: "Năm 3", stage: "new", skills: ["React", "TypeScript"], sent: "28/08", cv: "CV_NguyenMinhAnh_2026.pdf" },
  { id: 202, name: "Trần Quốc Bảo", school: "ĐH Công nghệ – ĐHQGHN", year: "Năm 4", stage: "new", skills: ["Vue", "Node"], sent: "27/08", cv: "CV_TranQuocBao.pdf" },
  { id: 203, name: "Lê Thu Hà", school: "ĐH Kinh tế Quốc dân", year: "Năm 3", stage: "shortlist", skills: ["React", "Figma"], sent: "26/08", cv: "CV_LeThuHa.pdf" },
  { id: 204, name: "Phạm Gia Khánh", school: "ĐH Bách khoa Đà Nẵng", year: "Năm 4", stage: "interview", skills: ["React", "SQL"], sent: "24/08", cv: "CV_PhamGiaKhanh.pdf" },
  { id: 205, name: "Vũ Hoàng Nam", school: "ĐH FPT", year: "Năm 3", stage: "reject", skills: ["Angular"], sent: "22/08", cv: "CV_VuHoangNam.pdf" },
];

var E_NAV = [
  { value: "dash", label: "Tổng quan", icon: "layout-dashboard" },
  { section: "Tuyển dụng" },
  { value: "jobs", label: "Tin tuyển dụng", icon: "briefcase", count: 6 },
  { value: "cands", label: "Ứng viên", icon: "users", count: 5 },
  { value: "messages", label: "Tin nhắn", icon: "message-square", count: 3 },
  { section: "Công ty" },
  { value: "company", label: "Hồ sơ công ty", icon: "building-2" },
  { value: "team", label: "Thành viên", icon: "user-plus" },
];

function ETopBar({ title, right }) {
  return (
    <header style={{ height: "var(--topbar-h)", flex: "none", display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "0 var(--space-6)", background: "var(--surface-card)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
      <h2 style={{ font: "var(--type-h2)", fontSize: "var(--text-xl)", flex: 1 }}>{title}</h2>
      {right}
      <IconButton icon="bell" label="Thông báo" />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", paddingLeft: "var(--space-3)", borderLeft: "var(--border-w) solid var(--border-subtle)" }}>
        <Avatar name="Phạm Thu Trang" role="employer" size="sm" />
        <div style={{ display: "grid" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Phạm Thu Trang</span>
          <span style={{ font: "var(--type-meta)", color: "var(--text-muted)" }}>HR · FPT Software</span>
        </div>
      </div>
    </header>
  );
}

function ELogo() {
  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <img src="../../assets/logo-mark.svg" alt="" style={{ height: 24 }} />
        <img src="../../assets/logo-wordmark.svg" alt="InternHub" style={{ height: 15 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2)", borderRadius: "var(--radius-md)", background: "var(--role-employer-soft)" }}>
        <Avatar name="FPT Software" role="employer" size="sm" />
        <div style={{ display: "grid", minWidth: 0 }}>
          <span style={{ font: "var(--type-label)", color: "var(--role-employer-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>FPT Software</span>
          <span style={{ font: "var(--type-meta)", color: "var(--role-employer)" }}>Đã xác thực</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { POSTS, CANDIDATES, E_NAV, ETopBar, ELogo });
