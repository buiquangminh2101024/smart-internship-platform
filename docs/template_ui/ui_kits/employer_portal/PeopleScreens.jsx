var { Icon, Avatar, Badge, Button, IconButton, Card, Tabs, Input, Select, Textarea, Checkbox, Switch, EmptyState, Toast, StatusPill } = window.InternHubDesignSystem_f6cc55;

var STAGES = [
  { value: "new", label: "Hồ sơ mới", icon: "inbox" },
  { value: "shortlist", label: "Vào vòng trong", icon: "list-check" },
  { value: "interview", label: "Phỏng vấn", icon: "calendar-check" },
  { value: "reject", label: "Từ chối", icon: "x" },
];

function CandidatesScreen({ onAction }) {
  const [stage, setStage] = React.useState("new");
  const [openId, setOpenId] = React.useState(201);
  const [moved, setMoved] = React.useState({});
  const stageOf = (c) => moved[c.id] || c.stage;
  const rows = CANDIDATES.filter((c) => stageOf(c) === stage);
  const open = CANDIDATES.find((c) => c.id === openId);
  const counts = (v) => CANDIDATES.filter((c) => stageOf(c) === v).length;

  return (
    <div style={{ display: "flex", gap: "var(--space-6)", padding: "var(--space-6)", alignItems: "flex-start", maxWidth: "var(--layout-max)" }}>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: "var(--space-4)" }}>
        <Card padding="sm" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <Select size="md" options={["Thực tập sinh Frontend (ReactJS)", "Thực tập sinh DevOps"]} style={{ width: 300 }} />
          <Input icon="search" placeholder="Tìm theo tên, trường, kỹ năng…" style={{ flex: 1 }} />
        </Card>
        <Tabs value={stage} onChange={setStage} items={STAGES.map((s) => ({ ...s, count: counts(s.value) }))} />
        {rows.length === 0 ? (
          <EmptyState compact icon="inbox" title="Chưa có hồ sơ ở bước này" description="Hồ sơ bạn chuyển sang bước này sẽ xuất hiện ở đây." />
        ) : (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {rows.map((c) => (
              <Card key={c.id} interactive selected={c.id === openId} onClick={() => setOpenId(c.id)} padding="md" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <Avatar name={c.name} role="candidate" size="lg" />
                <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                  <span style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{c.name}</span>
                  <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{c.school} · {c.year}</span>
                  <div style={{ display: "flex", gap: "var(--space-15)", marginTop: 4 }}>{c.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                </div>
                <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>Gửi {c.sent}</span>
                <Button size="sm" variant="secondary" icon="file-text">Xem CV</Button>
              </Card>
            ))}
          </div>
        )}
      </div>
      {open ? (
        <Card padding="lg" style={{ width: 400, flex: "none", display: "grid", gap: "var(--space-4)", position: "sticky", top: "var(--space-6)" }}>
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
            <Avatar name={open.name} role="candidate" size="xl" />
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ font: "var(--type-h2)", fontSize: "var(--text-xl)", color: "var(--text-strong)" }}>{open.name}</span>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{open.school}</span>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{open.year} · Gửi hồ sơ {open.sent}</span>
            </div>
          </div>
          <Card tone="sunken" padding="sm" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ display: "inline-flex", width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", color: "var(--pine-600)" }}><Icon name="file-text" size={17} /></span>
            <span style={{ flex: 1, font: "var(--type-body-sm)", color: "var(--text-strong)" }}>{open.cv}</span>
            <IconButton icon="download" label="Tải CV" size="sm" />
          </Card>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Kỹ năng khai báo</span>
            <div style={{ display: "flex", gap: "var(--space-15)", flexWrap: "wrap" }}>{open.skills.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</div>
            <p style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>Đánh giá mức độ phù hợp tự động chưa có trong phiên bản này — hãy đọc CV trước khi quyết định.</p>
          </div>
          <div style={{ display: "grid", gap: "var(--space-2)", borderTop: "var(--border-w) solid var(--border-subtle)", paddingTop: "var(--space-4)" }}>
            <Button icon="list-check" onClick={() => { setMoved({ ...moved, [open.id]: "shortlist" }); onAction("Đã chuyển " + open.name + " vào vòng trong.", "success"); }}>Chuyển vào vòng trong</Button>
            <Button variant="secondary" icon="calendar-plus" onClick={() => { setMoved({ ...moved, [open.id]: "interview" }); onAction("Đã tạo lịch phỏng vấn.", "info"); }}>Mời phỏng vấn</Button>
            <Button variant="ghost" icon="message-square">Nhắn tin cho ứng viên</Button>
            <Button variant="ghost" icon="x" onClick={() => { setMoved({ ...moved, [open.id]: "reject" }); onAction("Đã gửi thư từ chối lịch sự tới ứng viên.", "info"); }}>Từ chối hồ sơ</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function CompanyScreen({ onAction }) {
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: "var(--space-6)", maxWidth: "var(--layout-max)" }}>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card padding="lg" style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
          <Avatar name="FPT Software" role="employer" size="xl" />
          <div style={{ flex: 1, display: "grid", gap: "var(--space-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h1 style={{ font: "var(--type-h2)" }}>FPT Software</h1>
              <Badge tone="brand" icon="badge-check">Đã xác thực</Badge>
            </div>
            <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>Công nghệ thông tin · 1.000+ nhân viên · fpt-software.com</span>
          </div>
          <Button variant="secondary" size="sm" icon="pencil">Sửa</Button>
        </Card>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-4)" }}>
          <h3>Thông tin doanh nghiệp</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <Input label="Tên công ty" defaultValue="FPT Software" />
            <Input label="Mã số thuế" defaultValue="0101248141" hint="Dùng để Admin xác thực doanh nghiệp." />
            <Input label="Người liên hệ" defaultValue="Phạm Thu Trang" />
            <Input label="Email công việc" defaultValue="trang.pham@fpt-software.com" icon="mail" />
          </div>
          <Textarea label="Giới thiệu công ty" rows={4} maxLength={800} value="Công ty phần mềm với hơn 30.000 nhân sự, nhận thực tập sinh theo kỳ tại Hà Nội, Đà Nẵng và TP. Hồ Chí Minh." onChange={() => {}} />
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button icon="save" onClick={() => onAction("Đã lưu hồ sơ công ty.", "success")}>Lưu thay đổi</Button>
            <Button variant="ghost">Hủy</Button>
          </div>
        </Card>
      </div>
      <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
        <Card padding="md" style={{ display: "grid", gap: "var(--space-3)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Thành viên</span>
          {[["Phạm Thu Trang", "Quản trị công ty"], ["Đỗ Quang Huy", "Nhà tuyển dụng"], ["Ngô Thanh Sơn", "Chỉ xem"]].map(([n, r]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Avatar name={n} size="sm" />
              <div style={{ flex: 1, display: "grid" }}>
                <span style={{ font: "var(--type-body-sm)", color: "var(--text-strong)" }}>{n}</span>
                <span style={{ font: "var(--type-meta)", color: "var(--text-muted)" }}>{r}</span>
              </div>
              <IconButton icon="ellipsis-vertical" label="Tùy chọn" size="sm" />
            </div>
          ))}
          <Button variant="secondary" size="sm" icon="user-plus">Mời thành viên</Button>
        </Card>
        <Card padding="md" style={{ display: "grid", gap: "var(--space-3)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Thông báo</span>
          <Switch label="Email khi có hồ sơ mới" checked onChange={() => {}} />
          <Switch label="Email khi tin được duyệt" checked onChange={() => {}} />
          <Switch label="Nhắc trước khi tin hết hạn" checked={false} onChange={() => {}} />
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { CandidatesScreen, CompanyScreen });
