var { Icon, Avatar, Badge, Button, IconButton, Card, StatusPill, StatCard, Tabs, Input, Select, Textarea, Checkbox, Switch, EmptyState, Toast, Pagination } = window.InternHubDesignSystem_f6cc55;

function DashScreen({ go }) {
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-5)", maxWidth: "var(--layout-max)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-4)" }}>
        <StatCard icon="briefcase" label="Tin đang hiển thị" value={2} unit="tin" />
        <StatCard icon="clock" label="Chờ duyệt" value={1} unit="tin" hint="Admin thường duyệt trong 1 ngày" />
        <StatCard icon="users" label="Hồ sơ mới" value={26} delta="+8" deltaTone="up" hint="tuần này" />
        <StatCard icon="eye" label="Lượt xem tin" value="2.126" delta="-4%" deltaTone="down" hint="so với tuần trước" />
      </div>
      <Toast inline tone="warning" title="Tin “Thực tập sinh DevOps” sắp hết hạn" description="Còn 3 ngày. Gia hạn để tiếp tục nhận hồ sơ." action={<Button size="sm" variant="secondary">Gia hạn tin</Button>} />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--space-5)" }}>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h3 style={{ flex: 1 }}>Hồ sơ mới nhất</h3>
            <Button variant="link" onClick={() => go("cands")}>Xem tất cả</Button>
          </div>
          {CANDIDATES.slice(0, 4).map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", paddingBottom: "var(--space-3)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
              <Avatar name={c.name} role="candidate" size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{c.name}</div>
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{c.school} · {c.year}</div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-15)" }}>{c.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
              <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)", width: 44, textAlign: "right" }}>{c.sent}</span>
              <Button size="sm" variant="secondary">Xem CV</Button>
            </div>
          ))}
        </Card>
        <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
          <Card padding="lg" style={{ display: "grid", gap: "var(--space-3)" }}>
            <h3>Việc cần làm</h3>
            {[["Duyệt 5 hồ sơ mới", "users", "cands"], ["1 tin đang chờ Admin duyệt", "clock", "jobs"], ["3 tin nhắn chưa trả lời", "message-square", "messages"]].map(([t, i, v]) => (
              <button key={t} onClick={() => go(v)} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", background: "none", border: "none", padding: "var(--space-2) 0", cursor: "pointer", textAlign: "left", font: "var(--type-body)", color: "var(--text-body)" }}>
                <span style={{ display: "inline-flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", background: "var(--role-employer-soft)", color: "var(--role-employer)" }}><Icon name={i} size={16} /></span>
                <span style={{ flex: 1 }}>{t}</span>
                <Icon name="chevron-right" size={16} style={{ color: "var(--text-subtle)" }} />
              </button>
            ))}
          </Card>
          <Card padding="lg" tone="brand" style={{ display: "grid", gap: "var(--space-2)" }}>
            <span style={{ font: "var(--type-label)", color: "var(--pine-800)" }}>Đăng tin mới</span>
            <span style={{ font: "var(--type-body-sm)", color: "var(--pine-700)" }}>Tin của công ty đã xác thực được hiển thị ngay sau khi Admin duyệt.</span>
            <Button icon="plus" onClick={() => go("new")} style={{ justifySelf: "start" }}>Tạo tin tuyển dụng</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function JobsScreen({ go, onAction }) {
  const [tab, setTab] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const counts = POSTS.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {});
  const rows = POSTS.filter((p) => tab === "all" || p.status === tab);
  const th = { textAlign: "left", font: "var(--type-meta)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)", padding: "var(--space-3) var(--space-4)" };
  const td = { padding: "var(--space-3) var(--space-4)", font: "var(--type-body-sm)", color: "var(--text-body)", verticalAlign: "middle" };
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)", maxWidth: "var(--layout-max)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-4)" }}>
        <Tabs style={{ flex: 1 }} value={tab} onChange={setTab} items={[
          { value: "all", label: "Tất cả", count: POSTS.length },
          { value: "draft", label: "Nháp", count: counts.draft || 0 },
          { value: "review", label: "Chờ duyệt", count: counts.review || 0 },
          { value: "published", label: "Đang hiển thị", count: counts.published || 0 },
          { value: "expired", label: "Hết hạn", count: counts.expired || 0 },
          { value: "takendown", label: "Đã hạ", count: counts.takendown || 0 },
        ]} />
        <Button icon="plus" onClick={() => go("new")}>Tạo tin</Button>
      </div>
      <Card padding="none" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "var(--surface-sunken)" }}>
            <th style={{ ...th, width: 34 }}><Checkbox /></th>
            <th style={th}>Vị trí</th><th style={th}>Trạng thái</th><th style={th}>Khu vực</th>
            <th style={th}>Hạn</th><th style={{ ...th, textAlign: "right" }}>Lượt xem</th>
            <th style={{ ...th, textAlign: "right" }}>Hồ sơ</th><th style={th}>Cập nhật</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} style={{ borderTop: "var(--border-w) solid var(--border-subtle)" }}>
                <td style={td}><Checkbox /></td>
                <td style={{ ...td, font: "var(--type-label)", color: "var(--text-strong)" }}>{p.title}<div style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>JOB-2026-{p.id}</div></td>
                <td style={td}><StatusPill status={p.status} size="sm" /></td>
                <td style={td}>{p.location}</td>
                <td style={td}>{p.deadline}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{p.views.toLocaleString("vi-VN")}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{p.apps}</td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{p.updated}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {p.status === "draft" ? <Button size="sm" onClick={() => onAction("Đã gửi tin để Admin duyệt.", "success")}>Gửi duyệt</Button> : null}
                  {p.status === "published" ? <Button size="sm" variant="secondary" onClick={() => onAction("Đã đóng tin. Tin không còn nhận hồ sơ.", "info")}>Đóng tin</Button> : null}
                  {p.status === "expired" ? <Button size="sm" variant="secondary" onClick={() => onAction("Đã gia hạn tin thêm 30 ngày.", "success")}>Gia hạn</Button> : null}
                  <IconButton icon="ellipsis-vertical" label="Tùy chọn" size="sm" style={{ marginLeft: 4 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Pagination page={page} total={3} onChange={setPage} summary={`1–${rows.length} trong ${POSTS.length} tin`} />
    </div>
  );
}

function NewJobScreen({ onAction, go }) {
  const [f, setF] = React.useState({ title: "", city: "Hà Nội", industry: "Công nghệ thông tin", salaryFrom: "", salaryTo: "", desc: "", months: "3 tháng", remote: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: "var(--space-6)", maxWidth: "var(--layout-max)" }}>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-4)" }}>
          <h3>Thông tin vị trí</h3>
          <Input label="Tên vị trí" required placeholder="Ví dụ: Thực tập sinh Frontend (ReactJS)" value={f.title} onChange={set("title")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <Select label="Ngành" value={f.industry} onChange={set("industry")} options={["Công nghệ thông tin", "Marketing", "Kế toán – Kiểm toán", "Nhân sự"]} />
            <Select label="Khu vực" value={f.city} onChange={set("city")} options={["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}>
            <Input label="Lương từ (₫)" placeholder="4.000.000" value={f.salaryFrom} onChange={set("salaryFrom")} />
            <Input label="Lương đến (₫)" placeholder="6.000.000" value={f.salaryTo} onChange={set("salaryTo")} />
            <Select label="Thời gian thực tập" value={f.months} onChange={set("months")} options={["3 tháng", "4 tháng", "6 tháng"]} />
          </div>
          <Checkbox label="Có hỗ trợ làm việc remote" checked={f.remote} onChange={() => setF({ ...f, remote: !f.remote })} />
        </Card>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-4)" }}>
          <h3>Nội dung tin</h3>
          <Textarea label="Mô tả công việc" rows={5} maxLength={2000} value={f.desc} onChange={set("desc")} hint="Nêu rõ công việc hằng ngày và người hướng dẫn." />
          <Textarea label="Yêu cầu ứng viên" rows={4} maxLength={1200} value="" onChange={() => {}} />
        </Card>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button icon="send" onClick={() => { onAction("Đã gửi tin để Admin duyệt.", "success"); go("jobs"); }}>Gửi duyệt</Button>
          <Button variant="secondary" icon="save" onClick={() => { onAction("Đã lưu bản nháp.", "info"); go("jobs"); }}>Lưu nháp</Button>
          <Button variant="ghost" onClick={() => go("jobs")}>Hủy</Button>
        </div>
      </div>
      <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
        <Card padding="md" style={{ display: "grid", gap: "var(--space-3)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Quy trình duyệt</span>
          {[["Nháp", "Bạn đang ở đây", "draft"], ["Chờ duyệt", "Admin kiểm tra nội dung", "review"], ["Đang hiển thị", "Sinh viên thấy tin", "published"]].map(([t, s, st], i) => (
            <div key={t} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <span style={{ display: "inline-flex", width: 22, height: 22, flex: "none", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-pill)", background: i === 0 ? "var(--pine-500)" : "var(--surface-sunken)", color: i === 0 ? "#fff" : "var(--text-muted)", font: "var(--type-meta)" }}>{i + 1}</span>
              <div style={{ display: "grid", gap: 2 }}>
                <StatusPill status={st} size="sm" />
                <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{s}</span>
              </div>
            </div>
          ))}
        </Card>
        <Card padding="md" tone="warning" style={{ display: "grid", gap: "var(--space-2)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--marigold-600)" }}>Trước khi gửi duyệt</span>
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>Tin thiếu mức lương hoặc thời hạn ứng tuyển sẽ bị Admin trả lại.</span>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { DashScreen, JobsScreen, NewJobScreen });
