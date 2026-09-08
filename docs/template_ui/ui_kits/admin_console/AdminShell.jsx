var { Icon, Avatar, Badge, Button, IconButton, Card, StatusPill, StatCard, RoleBadge, Tabs, Input, Select, Textarea, Checkbox, Switch, EmptyState, Toast, Pagination } = window.InternHubDesignSystem_f6cc55;

var COMPANIES = [
  { id: 301, name: "Công ty TNHH Minh Phát", tax: "0401998233", city: "Đà Nẵng", submitted: "01/09/2026", state: "pending", docs: ["GiayPhepKinhDoanh.pdf", "CCCD_NguoiDaiDien.pdf"], contact: "Trần Văn Minh" },
  { id: 302, name: "Sunrise Digital Agency", tax: "0316552210", city: "TP. Hồ Chí Minh", submitted: "31/08/2026", state: "pending", docs: ["GiayPhepKinhDoanh.pdf"], contact: "Nguyễn Hải Yến" },
  { id: 303, name: "FPT Software", tax: "0101248141", city: "Hà Nội", submitted: "12/07/2026", state: "verified", docs: ["GiayPhepKinhDoanh.pdf"], contact: "Phạm Thu Trang" },
  { id: 304, name: "Beta Trading JSC", tax: "0109887712", city: "Hà Nội", submitted: "20/08/2026", state: "rejected", docs: ["GiayPhepKinhDoanh.pdf"], contact: "Lý Đức Anh" },
];

var QUEUE = [
  { id: 401, title: "Thực tập sinh Kiểm thử phần mềm", company: "FPT Software", verified: true, status: "review", submitted: "02/09/2026", salary: "Thỏa thuận", location: "Hà Nội", flags: [] },
  { id: 402, title: "Thực tập sinh Sales — thu nhập 20 triệu", company: "Sunrise Digital Agency", verified: false, status: "review", submitted: "02/09/2026", salary: "20 triệu / tháng", location: "TP. Hồ Chí Minh", flags: ["Mức lương bất thường", "Công ty chưa xác thực"] },
  { id: 403, title: "Thực tập sinh Kế toán", company: "Công ty TNHH Minh Phát", verified: false, status: "review", submitted: "01/09/2026", salary: "3 triệu / tháng", location: "Đà Nẵng", flags: ["Công ty chưa xác thực"] },
  { id: 404, title: "Thực tập sinh Thiết kế UI", company: "Beta Trading JSC", verified: false, status: "takendown", submitted: "15/08/2026", salary: "Thỏa thuận", location: "Hà Nội", flags: ["Báo cáo từ 3 sinh viên"] },
];

var USERS = [
  { id: 501, name: "Nguyễn Minh Anh", role: "candidate", email: "minhanh@sinhvien.hust.edu.vn", joined: "12/03/2026", state: "Hoạt động" },
  { id: 502, name: "Phạm Thu Trang", role: "employer", email: "trang.pham@fpt-software.com", joined: "05/01/2026", state: "Hoạt động" },
  { id: 503, name: "Lý Đức Anh", role: "employer", email: "duc.anh@betatrading.vn", joined: "18/08/2026", state: "Tạm khóa" },
  { id: 504, name: "Lê Thu Hà", role: "admin", email: "ha.le@internhub.vn", joined: "01/12/2025", state: "Hoạt động" },
];

var A_NAV = [
  { value: "dash", label: "Tổng quan", icon: "layout-dashboard" },
  { section: "Kiểm duyệt" },
  { value: "verify", label: "Xác thực doanh nghiệp", icon: "shield-check", count: 2 },
  { value: "queue", label: "Duyệt tin tuyển dụng", icon: "file-check-2", count: 3 },
  { value: "reports", label: "Báo cáo vi phạm", icon: "flag", count: 1 },
  { section: "Hệ thống" },
  { value: "users", label: "Người dùng", icon: "users" },
  { value: "settings", label: "Cấu hình duyệt", icon: "settings" },
];

function ATopBar({ title, right }) {
  return (
    <header style={{ height: "var(--topbar-h)", flex: "none", display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "0 var(--space-6)", background: "var(--surface-card)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
      <h2 style={{ font: "var(--type-h2)", fontSize: "var(--text-xl)", flex: 1 }}>{title}</h2>
      {right}
      <RoleBadge role="admin" />
      <IconButton icon="bell" label="Thông báo" />
      <Avatar name="Lê Thu Hà" role="admin" size="sm" />
    </header>
  );
}

function ALogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <img src="../../assets/logo-mark.svg" alt="" style={{ height: 24 }} />
      <div style={{ display: "grid" }}>
        <img src="../../assets/logo-wordmark.svg" alt="InternHub" style={{ height: 15 }} />
        <span style={{ font: "var(--type-meta)", color: "var(--role-admin)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", fontSize: 10 }}>Bảng quản trị</span>
      </div>
    </div>
  );
}

Object.assign(window, { COMPANIES, QUEUE, USERS, A_NAV, ATopBar, ALogo });
