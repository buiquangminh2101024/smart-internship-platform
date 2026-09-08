var { Icon, Avatar, Badge, Button, IconButton, Card, StatusPill, RoleBadge, JobCard, Tabs, SideNav, Pagination, Input, Select, Textarea, Checkbox, Switch, EmptyState, Toast, StatCard } = window.InternHubDesignSystem_f6cc55;

var JOBS = [
  { id: 1, title: "Thực tập sinh Frontend (ReactJS)", company: "FPT Software", verified: true, isNew: true, location: "Hà Nội", salary: "4 – 6 triệu / tháng", deadline: "Còn 12 ngày", tags: ["React", "3 tháng", "Hybrid"], industry: "Công nghệ thông tin",
    desc: "Tham gia phát triển giao diện cho sản phẩm quản trị nội bộ cùng đội 6 người. Bạn sẽ làm việc trực tiếp với mentor là Senior Frontend Engineer.",
    reqs: ["Sinh viên năm 3 – 4 ngành CNTT hoặc tương đương", "Nắm vững HTML, CSS, JavaScript ES6", "Đã làm ít nhất một dự án với React", "Tiếng Anh đọc hiểu tài liệu kỹ thuật"],
    perks: ["Trợ cấp 4 – 6 triệu / tháng", "Mentor 1:1 hàng tuần", "Xét chuyển chính thức sau 3 tháng"] },
  { id: 2, title: "Thực tập sinh Digital Marketing", company: "Tiki", verified: true, isNew: true, location: "TP. Hồ Chí Minh", salary: "3 – 5 triệu / tháng", deadline: "Còn 4 ngày", tags: ["Content", "6 tháng", "Tại chỗ"], industry: "Marketing",
    desc: "Hỗ trợ đội Growth lên kế hoạch nội dung cho các chiến dịch khuyến mãi theo tháng.", reqs: ["Sinh viên năm 3 – 4", "Viết tiếng Việt tốt", "Biết dùng Canva hoặc Figma cơ bản"], perks: ["Trợ cấp 3 – 5 triệu / tháng", "Được cấp laptop"] },
  { id: 3, title: "Thực tập sinh Kiểm thử phần mềm", company: "VNG Corporation", verified: true, location: "TP. Hồ Chí Minh", salary: "Thỏa thuận", deadline: "Còn 20 ngày", tags: ["Manual QA", "6 tháng"], industry: "Công nghệ thông tin",
    desc: "Viết và thực thi test case cho các tính năng mới của sản phẩm thanh toán.", reqs: ["Sinh viên năm 3 – 4", "Cẩn thận, ghi chép rõ ràng"], perks: ["Trợ cấp theo năng lực", "Cơ hội ở lại team QA"] },
  { id: 4, title: "Thực tập sinh Kế toán", company: "Công ty TNHH Minh Phát", verified: false, location: "Đà Nẵng", salary: "3 triệu / tháng", deadline: "Còn 8 ngày", tags: ["Kế toán", "4 tháng"], industry: "Kế toán – Kiểm toán",
    desc: "Hỗ trợ đối chiếu chứng từ và nhập liệu sổ sách cùng phòng Kế toán 4 người.", reqs: ["Sinh viên năm 3 – 4 ngành Kế toán", "Thành thạo Excel"], perks: ["Trợ cấp 3 triệu / tháng", "Xác nhận thực tập theo mẫu của trường"] },
  { id: 5, title: "Thực tập sinh Nhân sự (Tuyển dụng)", company: "Techcombank", verified: true, location: "Hà Nội", salary: "4 triệu / tháng", deadline: "Còn 15 ngày", tags: ["HR", "6 tháng", "Hybrid"], industry: "Nhân sự",
    desc: "Sàng lọc hồ sơ, đặt lịch phỏng vấn và theo dõi dữ liệu ứng viên trên hệ thống.", reqs: ["Sinh viên năm 3 – 4", "Giao tiếp tốt", "Cẩn thận với dữ liệu"], perks: ["Trợ cấp 4 triệu / tháng", "Đào tạo nghiệp vụ tuyển dụng"] },
];

var APPLICATIONS = [
  { id: 11, job: JOBS[0], stage: "Chờ phản hồi", tone: "info", sent: "28/08/2026" },
  { id: 12, job: JOBS[2], stage: "Mời phỏng vấn", tone: "success", sent: "24/08/2026" },
  { id: 13, job: JOBS[3], stage: "Không phù hợp", tone: "danger", sent: "18/08/2026" },
];

var THREADS = [
  { id: 21, name: "Phạm Thu Trang", org: "FPT Software", role: "employer", last: "Bạn rảnh phỏng vấn thứ Năm 14:00 chứ?", time: "10:24", unread: 2,
    messages: [
      { me: false, text: "Chào bạn, mình đã xem hồ sơ và rất ấn tượng với dự án cuối khóa.", time: "10:02" },
      { me: true, text: "Cảm ơn chị. Em rất mong được trao đổi thêm về vị trí này.", time: "10:15" },
      { me: false, text: "Bạn rảnh phỏng vấn thứ Năm 14:00 chứ?", time: "10:24" },
    ] },
  { id: 22, name: "Đỗ Quang Huy", org: "VNG Corporation", role: "employer", last: "Mình gửi bạn đề bài nhỏ nhé.", time: "Hôm qua", unread: 0,
    messages: [{ me: false, text: "Mình gửi bạn đề bài nhỏ nhé.", time: "Hôm qua 16:40" }] },
];

var NAV = [
  { value: "search", label: "Tìm việc", icon: "search" },
  { value: "saved", label: "Tin đã lưu", icon: "bookmark", count: 2 },
  { value: "apps", label: "Hồ sơ đã gửi", icon: "send", count: 3 },
  { section: "Của bạn" },
  { value: "messages", label: "Tin nhắn", icon: "message-square", count: 2 },
  { value: "profile", label: "Hồ sơ & CV", icon: "file-user" },
];

function TopBar({ title, right }) {
  return (
    <header style={{ height: "var(--topbar-h)", flex: "none", display: "flex", alignItems: "center", gap: "var(--space-4)", padding: "0 var(--space-6)", background: "var(--surface-card)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
      <h2 style={{ font: "var(--type-h2)", fontSize: "var(--text-xl)", flex: 1 }}>{title}</h2>
      {right}
      <IconButton icon="bell" label="Thông báo" />
      <Avatar name="Nguyễn Minh Anh" size="sm" role="candidate" />
    </header>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <img src="../../assets/logo-mark.svg" alt="" style={{ height: 26 }} />
      <img src="../../assets/logo-wordmark.svg" alt="InternHub" style={{ height: 17 }} />
    </div>
  );
}

Object.assign(window, { IH: window.InternHubDesignSystem_f6cc55, JOBS, APPLICATIONS, THREADS, NAV, TopBar, Logo });
