var { Icon, Avatar, Badge, Button, IconButton, Card, StatusPill, StatCard, RoleBadge, Tabs, Input, Select, Textarea, Checkbox, Switch, EmptyState, Toast, Pagination } = window.InternHubDesignSystem_f6cc55;

function ADashScreen({ go }) {
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-5)", maxWidth: "var(--layout-max)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--space-4)" }}>
        <StatCard icon="shield-check" label="Chờ xác thực doanh nghiệp" value={2} unit="công ty" />
        <StatCard icon="file-check-2" label="Tin chờ duyệt" value={3} unit="tin" hint="SLA nội bộ: 1 ngày làm việc" />
        <StatCard icon="flag" label="Báo cáo vi phạm" value={1} delta="+1" deltaTone="up" hint="hôm nay" />
        <StatCard icon="users" label="Người dùng hoạt động" value="12.408" delta="+312" deltaTone="up" hint="tháng này" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)" }}>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h3 style={{ flex: 1 }}>Tin chờ duyệt</h3>
            <Button variant="link" onClick={() => go("queue")}>Mở hàng đợi</Button>
          </div>
          {QUEUE.filter((q) => q.status === "review").map((q) => (
            <div key={q.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", paddingBottom: "var(--space-3)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
              <Avatar name={q.company} role="employer" size="md" />
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{q.title}</span>
                <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{q.company} · {q.submitted}</span>
              </div>
              {q.flags.length ? <Badge tone="warning" icon="triangle-alert">{q.flags.length}</Badge> : null}
              <Button size="sm" variant="secondary" onClick={() => go("queue")}>Xem</Button>
            </div>
          ))}
        </Card>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h3 style={{ flex: 1 }}>Doanh nghiệp chờ xác thực</h3>
            <Button variant="link" onClick={() => go("verify")}>Xem tất cả</Button>
          </div>
          {COMPANIES.filter((c) => c.state === "pending").map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", paddingBottom: "var(--space-3)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
              <Avatar name={c.name} role="employer" size="md" />
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{c.name}</span>
                <span style={{ font: "var(--type-mono)", color: "var(--text-muted)" }}>MST {c.tax}</span>
              </div>
              <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>{c.submitted}</span>
              <Button size="sm" variant="secondary" onClick={() => go("verify")}>Xét hồ sơ</Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function VerifyScreen({ onAction }) {
  const [openId, setOpenId] = React.useState(301);
  const [decided, setDecided] = React.useState({});
  const stateOf = (c) => decided[c.id] || c.state;
  const open = COMPANIES.find((c) => c.id === openId);
  const pill = { pending: ["warning", "Chờ xác thực"], verified: ["success", "Đã xác thực"], rejected: ["danger", "Từ chối"] };
  return (
    <div style={{ display: "flex", gap: "var(--space-6)", padding: "var(--space-6)", alignItems: "flex-start", maxWidth: "var(--layout-max)" }}>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: "var(--space-3)" }}>
        {COMPANIES.map((c) => {
          const [tone, label] = pill[stateOf(c)];
          return (
            <Card key={c.id} interactive selected={c.id === openId} onClick={() => setOpenId(c.id)} padding="md" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <Avatar name={c.name} role="employer" size="lg" />
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{c.name}</span>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>MST {c.tax} · {c.city} · {c.contact}</span>
              </div>
              <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>Gửi {c.submitted}</span>
            </Card>
          );
        })}
      </div>
      <Card padding="lg" style={{ width: 400, flex: "none", display: "grid", gap: "var(--space-4)", position: "sticky", top: "var(--space-6)" }}>
        <div style={{ display: "grid", gap: "var(--space-1)" }}>
          <span style={{ font: "var(--type-h2)", fontSize: "var(--text-xl)" }}>{open.name}</span>
          <span style={{ font: "var(--type-mono)", color: "var(--text-muted)" }}>MST {open.tax}</span>
        </div>
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Giấy tờ đã gửi</span>
          {open.docs.map((d) => (
            <Card key={d} tone="sunken" padding="sm" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Icon name="file-text" size={16} style={{ color: "var(--pine-600)" }} />
              <span style={{ flex: 1, font: "var(--type-body-sm)", color: "var(--text-strong)" }}>{d}</span>
              <IconButton icon="external-link" label="Mở" size="sm" />
            </Card>
          ))}
        </div>
        <Textarea label="Ghi chú kiểm duyệt" rows={3} maxLength={400} value="" onChange={() => {}} hint="Ghi chú hiển thị trong lịch sử xử lý, không gửi cho doanh nghiệp." />
        <div style={{ display: "grid", gap: "var(--space-2)", borderTop: "var(--border-w) solid var(--border-subtle)", paddingTop: "var(--space-4)" }}>
          <Button icon="shield-check" onClick={() => { setDecided({ ...decided, [open.id]: "verified" }); onAction("Đã xác thực " + open.name + ".", "success"); }}>Xác thực doanh nghiệp</Button>
          <Button variant="secondary" icon="mail" onClick={() => onAction("Đã yêu cầu doanh nghiệp bổ sung giấy tờ.", "info")}>Yêu cầu bổ sung giấy tờ</Button>
          <Button variant="danger" icon="x" onClick={() => { setDecided({ ...decided, [open.id]: "rejected" }); onAction("Đã từ chối hồ sơ doanh nghiệp.", "danger"); }}>Từ chối hồ sơ</Button>
        </div>
      </Card>
    </div>
  );
}

function QueueScreen({ onAction }) {
  const [tab, setTab] = React.useState("review");
  const [state, setState] = React.useState({});
  const statusOf = (q) => state[q.id] || q.status;
  const rows = QUEUE.filter((q) => statusOf(q) === tab);
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)", maxWidth: 1080 }}>
      <Tabs value={tab} onChange={setTab} items={[
        { value: "review", label: "Chờ duyệt", count: QUEUE.filter((q) => statusOf(q) === "review").length },
        { value: "published", label: "Đã duyệt", count: QUEUE.filter((q) => statusOf(q) === "published").length },
        { value: "takendown", label: "Đã hạ", count: QUEUE.filter((q) => statusOf(q) === "takendown").length },
      ]} />
      {rows.length === 0 ? (
        <EmptyState compact icon="check-check" title="Hàng đợi trống" description="Không còn tin nào ở trạng thái này." />
      ) : rows.map((q) => (
        <Card key={q.id} padding="lg" style={{ display: "grid", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <Avatar name={q.company} role="employer" size="lg" />
            <div style={{ flex: 1, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <span style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{q.title}</span>
                <StatusPill status={statusOf(q)} size="sm" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
                {q.company}
                {q.verified ? <Badge tone="brand" icon="badge-check">Đã xác thực</Badge> : <Badge tone="warning" icon="clock">Chưa xác thực</Badge>}
                <span>· {q.location} · {q.salary} · Gửi {q.submitted}</span>
              </div>
            </div>
          </div>
          {q.flags.length ? (
            <Toast inline tone="warning" title="Cần kiểm tra" description={q.flags.join(" · ")} />
          ) : (
            <Toast inline tone="info" title="Không phát hiện dấu hiệu bất thường" description="Doanh nghiệp đã xác thực, mức lương trong khoảng thông thường." />
          )}
          {statusOf(q) === "review" ? (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button icon="check" onClick={() => { setState({ ...state, [q.id]: "published" }); onAction("Đã duyệt và hiển thị tin.", "success"); }}>Duyệt tin</Button>
              <Button variant="secondary" icon="pencil" onClick={() => onAction("Đã gửi yêu cầu sửa cho nhà tuyển dụng.", "info")}>Yêu cầu sửa</Button>
              <Button variant="danger" icon="ban" onClick={() => { setState({ ...state, [q.id]: "takendown" }); onAction("Đã hạ tin và thông báo cho doanh nghiệp.", "danger"); }}>Hạ tin</Button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button variant="secondary" icon="rotate-ccw" onClick={() => { setState({ ...state, [q.id]: "review" }); onAction("Đã trả tin về hàng đợi.", "info"); }}>Đưa về chờ duyệt</Button>
              <Button variant="ghost" icon="history">Lịch sử xử lý</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function UsersScreen({ onAction }) {
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("Tất cả vai trò");
  const map = { "Ứng viên": "candidate", "Nhà tuyển dụng": "employer", "Quản trị viên": "admin" };
  const rows = USERS.filter((u) => (role === "Tất cả vai trò" || u.role === map[role]) && (u.name + u.email).toLowerCase().includes(q.toLowerCase()));
  const th = { textAlign: "left", font: "var(--type-meta)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)", padding: "var(--space-3) var(--space-4)" };
  const td = { padding: "var(--space-3) var(--space-4)", font: "var(--type-body-sm)", color: "var(--text-body)" };
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)", maxWidth: 1080 }}>
      <Card padding="sm" style={{ display: "flex", gap: "var(--space-2)" }}>
        <Input icon="search" placeholder="Tìm theo tên hoặc email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <Select value={role} onChange={(e) => setRole(e.target.value)} options={["Tất cả vai trò", "Ứng viên", "Nhà tuyển dụng", "Quản trị viên"]} style={{ width: 200 }} />
      </Card>
      <Card padding="none" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "var(--surface-sunken)" }}>
            <th style={th}>Người dùng</th><th style={th}>Vai trò</th><th style={th}>Email</th><th style={th}>Tham gia</th><th style={th}>Trạng thái</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={{ borderTop: "var(--border-w) solid var(--border-subtle)" }}>
                <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}><Avatar name={u.name} role={u.role} size="sm" /><span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{u.name}</span></span></td>
                <td style={td}><RoleBadge role={u.role} /></td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{u.email}</td>
                <td style={td}>{u.joined}</td>
                <td style={td}><Badge tone={u.state === "Hoạt động" ? "success" : "danger"}>{u.state}</Badge></td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Button size="sm" variant="ghost" onClick={() => onAction(u.state === "Hoạt động" ? "Đã tạm khóa tài khoản." : "Đã mở lại tài khoản.", "info")}>{u.state === "Hoạt động" ? "Tạm khóa" : "Mở khóa"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SettingsScreen({ onAction }) {
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)", maxWidth: 720 }}>
      <Card padding="lg" style={{ display: "grid", gap: "var(--space-4)" }}>
        <div>
          <h3>Quy tắc duyệt tin</h3>
          <p style={{ font: "var(--type-body-sm)", color: "var(--text-muted)", marginTop: 4 }}>Cấu hình áp dụng cho toàn bộ doanh nghiệp; có thể ghi đè theo từng công ty.</p>
        </div>
        <Switch label="Tin của công ty đã xác thực hiển thị ngay" description="Bỏ qua bước chờ duyệt cho doanh nghiệp đã xác thực." checked onChange={() => {}} />
        <Switch label="Bắt buộc có mức lương" description="Tin thiếu mức lương sẽ bị trả lại tự động." checked onChange={() => {}} />
        <Switch label="Tự động hết hạn sau 60 ngày" checked={false} onChange={() => {}} />
        <Select label="Người duyệt mặc định" options={["Lê Thu Hà", "Đội kiểm duyệt nội dung"]} />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button icon="save" onClick={() => onAction("Đã lưu cấu hình duyệt.", "success")}>Lưu cấu hình</Button>
          <Button variant="ghost">Hủy</Button>
        </div>
      </Card>
      <Card padding="lg" tone="warning" style={{ display: "grid", gap: "var(--space-2)" }}>
        <span style={{ font: "var(--type-label)", color: "var(--marigold-600)" }}>Tính năng AI chưa bật</span>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>Phân tích CV và gợi ý ứng viên đang ở giai đoạn chuẩn bị hạ tầng. Khi bật, mục cấu hình riêng sẽ xuất hiện tại đây.</span>
      </Card>
    </div>
  );
}

Object.assign(window, { ADashScreen, VerifyScreen, QueueScreen, UsersScreen, SettingsScreen });
