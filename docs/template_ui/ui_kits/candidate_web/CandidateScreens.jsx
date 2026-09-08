var { Icon, Avatar, Badge, Button, IconButton, Card, JobCard, Tabs, EmptyState, Input, Switch, Checkbox, StatusPill } = window.InternHubDesignSystem_f6cc55;

function SavedScreen({ savedIds, toggleSave }) {
  const list = JOBS.filter((j) => savedIds.includes(j.id));
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)", maxWidth: 880 }}>
      {list.length === 0 ? (
        <EmptyState icon="bookmark" tone="brand" title="Chưa có tin nào được lưu" description="Nhấn dấu lưu trên tin tuyển dụng để xem lại sau." action={<Button variant="secondary" icon="search">Tìm việc</Button>} />
      ) : (
        list.map((j) => <JobCard key={j.id} {...j} saved onSave={() => toggleSave(j.id)} footer={<Button size="sm" icon="send">Ứng tuyển</Button>} />)
      )}
    </div>
  );
}

function AppsScreen() {
  const [tab, setTab] = React.useState("all");
  const rows = APPLICATIONS.filter((a) => tab === "all" || (tab === "waiting" && a.tone === "info") || (tab === "interview" && a.tone === "success") || (tab === "closed" && a.tone === "danger"));
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-4)", maxWidth: 940 }}>
      <Tabs value={tab} onChange={setTab} items={[{ value: "all", label: "Tất cả", count: 3 }, { value: "waiting", label: "Chờ phản hồi", count: 1 }, { value: "interview", label: "Mời phỏng vấn", count: 1 }, { value: "closed", label: "Đã kết thúc", count: 1 }]} />
      <Card padding="none">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-sunken)" }}>
              {["Vị trí", "Công ty", "Ngày gửi", "Trạng thái", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", font: "var(--type-meta)", color: "var(--text-muted)", padding: "var(--space-3) var(--space-4)", textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", fontSize: "var(--text-2xs)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} style={{ borderTop: "var(--border-w) solid var(--border-subtle)" }}>
                <td style={{ padding: "var(--space-3) var(--space-4)", font: "var(--type-label)", color: "var(--text-strong)" }}>{a.job.title}</td>
                <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", font: "var(--type-body-sm)" }}>
                    <Avatar name={a.job.company} role="employer" size="xs" />{a.job.company}
                  </span>
                </td>
                <td style={{ padding: "var(--space-3) var(--space-4)", font: "var(--type-mono)", color: "var(--text-muted)" }}>{a.sent}</td>
                <td style={{ padding: "var(--space-3) var(--space-4)" }}><Badge tone={a.tone}>{a.stage}</Badge></td>
                <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "right" }}>
                  <Button variant="ghost" size="sm" iconAfter="chevron-right">Chi tiết</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MessagesScreen() {
  const [active, setActive] = React.useState(THREADS[0].id);
  const [draft, setDraft] = React.useState("");
  const [sent, setSent] = React.useState({});
  const thread = THREADS.find((t) => t.id === active);
  const msgs = [...thread.messages, ...(sent[active] || [])];
  const send = () => { if (!draft.trim()) return; setSent({ ...sent, [active]: [...(sent[active] || []), { me: true, text: draft, time: "Vừa xong" }] }); setDraft(""); };
  return (
    <div style={{ display: "flex", height: "calc(100vh - var(--topbar-h))" }}>
      <div style={{ width: 300, flex: "none", borderRight: "var(--border-w) solid var(--border-subtle)", background: "var(--surface-card)", overflow: "auto" }}>
        {THREADS.map((t) => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{ display: "flex", gap: "var(--space-3)", width: "100%", textAlign: "left", padding: "var(--space-3) var(--space-4)", border: "none", borderBottom: "var(--border-w) solid var(--border-subtle)", background: t.id === active ? "var(--pine-50)" : "transparent", cursor: "pointer" }}>
            <Avatar name={t.org} role="employer" size="md" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{t.name}</span>
                <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>{t.time}</span>
              </div>
              <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: 4 }}>
                <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>{t.org}</span>
                {t.unread ? <span style={{ background: "var(--pine-500)", color: "#fff", font: "var(--type-meta)", fontSize: 10, borderRadius: "var(--radius-pill)", padding: "0 6px" }}>{t.unread}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-5)", background: "var(--surface-card)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
          <Avatar name={thread.org} role="employer" size="sm" />
          <div style={{ flex: 1 }}>
            <div style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{thread.name}</div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{thread.org} · Nhà tuyển dụng</div>
          </div>
          <IconButton icon="phone" label="Gọi" />
          <IconButton icon="ellipsis-vertical" label="Tùy chọn" />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.me ? "flex-end" : "flex-start", maxWidth: 460 }}>
              <div style={{ padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-xl)", borderBottomRightRadius: m.me ? "var(--radius-xs)" : "var(--radius-xl)", borderBottomLeftRadius: m.me ? "var(--radius-xl)" : "var(--radius-xs)", background: m.me ? "var(--pine-500)" : "var(--surface-card)", color: m.me ? "#fff" : "var(--text-body)", border: m.me ? "none" : "var(--border-w) solid var(--border-subtle)", font: "var(--type-body)" }}>{m.text}</div>
              <div style={{ font: "var(--type-meta)", color: "var(--text-subtle)", marginTop: 4, textAlign: m.me ? "right" : "left" }}>{m.time}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", padding: "var(--space-3) var(--space-5)", background: "var(--surface-card)", borderTop: "var(--border-w) solid var(--border-subtle)" }}>
          <IconButton icon="paperclip" label="Gửi tệp" />
          <Input placeholder="Nhập tin nhắn…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ flex: 1 }} />
          <Button icon="send" onClick={send}>Gửi</Button>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen() {
  const [visible, setVisible] = React.useState(true);
  return (
    <div style={{ padding: "var(--space-6)", display: "grid", gridTemplateColumns: "1fr 300px", gap: "var(--space-6)", maxWidth: "var(--layout-max)" }}>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card padding="lg" style={{ display: "flex", gap: "var(--space-4)" }}>
          <Avatar name="Nguyễn Minh Anh" role="candidate" size="xl" />
          <div style={{ flex: 1, display: "grid", gap: "var(--space-1)" }}>
            <h1 style={{ font: "var(--type-h2)" }}>Nguyễn Minh Anh</h1>
            <div style={{ font: "var(--type-body)", color: "var(--text-body)" }}>Sinh viên năm 3 · Kỹ thuật phần mềm · Đại học Bách khoa Hà Nội</div>
            <div style={{ display: "flex", gap: "var(--space-4)", font: "var(--type-body-sm)", color: "var(--text-muted)", marginTop: 4 }}>
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="mail" size={14} />minhanh@sinhvien.hust.edu.vn</span>
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="map-pin" size={14} />Hà Nội</span>
            </div>
            <div style={{ display: "flex", gap: "var(--space-15)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
              {["React", "TypeScript", "Figma", "SQL", "Tiếng Anh IELTS 6.5"].map((s) => <Badge key={s}>{s}</Badge>)}
            </div>
          </div>
          <Button variant="secondary" icon="pencil" size="sm">Sửa hồ sơ</Button>
        </Card>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-3)" }}>
          <h3>CV của bạn</h3>
          <Card tone="sunken" padding="sm" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ display: "inline-flex", width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", color: "var(--pine-600)" }}><Icon name="file-text" size={18} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>CV_NguyenMinhAnh_2026.pdf</div>
              <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>Cập nhật 26/08/2026 · 412 KB</div>
            </div>
            <Button variant="ghost" size="sm" icon="download">Tải xuống</Button>
            <Button variant="secondary" size="sm" icon="upload">Tải CV mới</Button>
          </Card>
          <p style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>Phân tích CV tự động sẽ có trong bản cập nhật sau. Hiện tại nhà tuyển dụng đọc trực tiếp tệp bạn tải lên.</p>
        </Card>
        <Card padding="lg" style={{ display: "grid", gap: "var(--space-3)" }}>
          <h3>Kinh nghiệm & dự án</h3>
          {[["Dự án cuối khóa — Web quản lý thư viện", "09/2025 – 01/2026", "Vai trò Frontend, React + Tailwind, nhóm 4 người."], ["CLB Lập trình HUST", "2024 – nay", "Thành viên ban kỹ thuật, tổ chức 3 workshop cho sinh viên năm nhất."]].map(([t, d, s]) => (
            <div key={t} style={{ display: "grid", gap: 2, paddingBottom: "var(--space-3)", borderBottom: "var(--border-w) solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{t}</span>
                <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)" }}>{d}</span>
              </div>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{s}</span>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
        <Card padding="md" style={{ display: "grid", gap: "var(--space-3)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Mức độ hoàn thiện</span>
          <div style={{ height: 8, borderRadius: "var(--radius-pill)", background: "var(--surface-sunken)" }}>
            <div style={{ width: "80%", height: "100%", borderRadius: "var(--radius-pill)", background: "var(--pine-500)" }} />
          </div>
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>80% — thêm mô tả dự án để tăng cơ hội được xem hồ sơ.</span>
        </Card>
        <Card padding="md" style={{ display: "grid", gap: "var(--space-3)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Quyền riêng tư</span>
          <Switch label="Cho nhà tuyển dụng tìm thấy hồ sơ" checked={visible} onChange={() => setVisible(!visible)} />
          <Switch label="Nhận email khi có tin phù hợp" checked onChange={() => {}} />
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { SavedScreen, AppsScreen, MessagesScreen, ProfileScreen });
