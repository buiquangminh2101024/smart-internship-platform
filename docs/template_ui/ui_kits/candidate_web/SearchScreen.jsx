var { Icon, Avatar, Badge, Button, IconButton, Card, JobCard, Input, Select, Checkbox, Pagination, EmptyState, Toast, StatusPill } = window.InternHubDesignSystem_f6cc55;

function FilterPanel({ filters, setFilters }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v });
  return (
    <Card padding="md" style={{ width: 244, flex: "none", alignSelf: "flex-start", display: "grid", gap: "var(--space-4)", position: "sticky", top: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Bộ lọc</span>
        <Button variant="link" style={{ font: "var(--type-body-sm)" }} onClick={() => setFilters({ industry: "Tất cả ngành", city: "Tất cả khu vực", salary: "Mọi mức lương", remote: false, verified: true })}>Đặt lại</Button>
      </div>
      <Select label="Ngành" size="sm" value={filters.industry} onChange={(e) => set("industry", e.target.value)} options={["Tất cả ngành", "Công nghệ thông tin", "Marketing", "Kế toán – Kiểm toán", "Nhân sự"]} />
      <Select label="Khu vực" size="sm" value={filters.city} onChange={(e) => set("city", e.target.value)} options={["Tất cả khu vực", "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"]} />
      <Select label="Mức lương" size="sm" value={filters.salary} onChange={(e) => set("salary", e.target.value)} options={["Mọi mức lương", "Từ 3 triệu", "Từ 5 triệu", "Thỏa thuận"]} />
      <div style={{ display: "grid", gap: "var(--space-2)", paddingTop: "var(--space-1)", borderTop: "var(--border-w) solid var(--border-subtle)" }}>
        <Checkbox label="Có hỗ trợ remote" checked={filters.remote} onChange={() => set("remote", !filters.remote)} />
        <Checkbox label="Chỉ công ty đã xác thực" checked={filters.verified} onChange={() => set("verified", !filters.verified)} />
      </div>
    </Card>
  );
}

function JobDetail({ job, saved, onSave, onApply, onClose }) {
  return (
    <Card padding="lg" style={{ display: "grid", gap: "var(--space-5)" }}>
      <div style={{ display: "flex", gap: "var(--space-4)" }}>
        <Avatar name={job.company} role="employer" size="xl" />
        <div style={{ flex: 1, display: "grid", gap: "var(--space-15)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <h1 style={{ font: "var(--type-h1)", flex: 1 }}>{job.title}</h1>
            <IconButton icon="x" label="Đóng" onClick={onClose} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", font: "var(--type-body)", color: "var(--text-body)" }}>
            {job.company}
            {job.verified ? <Badge tone="brand" icon="badge-check">Đã xác thực</Badge> : <Badge tone="warning" icon="clock">Chờ xác thực</Badge>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", font: "var(--type-body-sm)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="map-pin" size={14} />{job.location}</span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="wallet" size={14} />{job.salary}</span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Icon name="calendar-clock" size={14} />{job.deadline}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", minWidth: 0, gap: "var(--space-2)" }}>
        <Button icon="send" onClick={onApply}>Ứng tuyển ngay</Button>
        <Button variant="secondary" icon="bookmark" onClick={onSave}>{saved ? "Đã lưu" : "Lưu tin"}</Button>
        <Button variant="ghost" icon="message-square">Nhắn tin</Button>
      </div>
      <div style={{ display: "grid", gap: "var(--space-4)", borderTop: "var(--border-w) solid var(--border-subtle)", paddingTop: "var(--space-5)" }}>
        <section style={{ display: "grid", gap: "var(--space-2)" }}>
          <h3>Mô tả công việc</h3>
          <p style={{ font: "var(--type-body)", maxWidth: "var(--layout-prose)" }}>{job.desc}</p>
        </section>
        <section style={{ display: "grid", gap: "var(--space-2)" }}>
          <h3>Yêu cầu</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)", font: "var(--type-body)", display: "grid", gap: "var(--space-1)" }}>
            {job.reqs.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </section>
        <section style={{ display: "grid", gap: "var(--space-2)" }}>
          <h3>Quyền lợi</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)", font: "var(--type-body)", display: "grid", gap: "var(--space-1)" }}>
            {job.perks.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </section>
      </div>
    </Card>
  );
}

function ApplyDialog({ job, onClose, onSend }) {
  const [note, setNote] = React.useState("");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--surface-overlay)", backdropFilter: "var(--blur-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <Card onClick={(e) => e.stopPropagation()} padding="lg" style={{ width: 520, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-xl)", display: "grid", gap: "var(--space-4)" }}>
        <div>
          <h2 style={{ font: "var(--type-h2)" }}>Ứng tuyển vị trí này</h2>
          <p style={{ font: "var(--type-body-sm)", color: "var(--text-muted)", marginTop: 4 }}>{job.title} · {job.company}</p>
        </div>
        <Card tone="sunken" padding="sm" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ display: "inline-flex", width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", color: "var(--pine-600)" }}><Icon name="file-text" size={18} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>CV_NguyenMinhAnh_2026.pdf</div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>Cập nhật 26/08/2026 · 412 KB</div>
          </div>
          <Button variant="ghost" size="sm">Đổi CV</Button>
        </Card>
        <div style={{ display: "grid", gap: "var(--space-15)" }}>
          <label style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>Thư giới thiệu (không bắt buộc)</label>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vì sao bạn phù hợp với vị trí này?" style={{ width: "100%", padding: "var(--space-3)", font: "var(--type-body)", color: "var(--text-strong)", border: "var(--border-w) solid var(--border-default)", borderRadius: "var(--radius-md)", resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button icon="send" onClick={onSend}>Gửi hồ sơ</Button>
        </div>
      </Card>
    </div>
  );
}

function SearchScreen({ savedIds, toggleSave, onApplied }) {
  const [filters, setFilters] = React.useState({ industry: "Tất cả ngành", city: "Tất cả khu vực", salary: "Mọi mức lương", remote: false, verified: true });
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState(1);
  const [applying, setApplying] = React.useState(null);
  const [page, setPage] = React.useState(1);

  const list = JOBS.filter((j) =>
    (filters.industry === "Tất cả ngành" || j.industry === filters.industry) &&
    (filters.city === "Tất cả khu vực" || j.location === filters.city) &&
    (!filters.verified || j.verified) &&
    (q.trim() === "" || (j.title + j.company).toLowerCase().includes(q.toLowerCase())));
  const open = list.find((j) => j.id === openId);

  return (
    <div style={{ display: "flex", gap: "var(--space-6)", padding: "var(--space-6)", alignItems: "flex-start" }}>
      <FilterPanel filters={filters} setFilters={setFilters} />
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: "var(--space-4)" }}>
        <Card padding="sm" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <Input icon="search" placeholder="Tìm vị trí, công ty, kỹ năng…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <Select size="md" options={[{ value: "new", label: "Mới nhất" }, { value: "salary", label: "Lương cao nhất" }, { value: "deadline", label: "Sắp hết hạn" }]} style={{ width: 170 }} />
        </Card>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{list.length} tin phù hợp · cập nhật hôm nay</span>
        </div>
        {list.length === 0 ? (
          <EmptyState icon="search-x" title="Không tìm thấy tin phù hợp" description="Thử bỏ bộ lọc mức lương hoặc mở rộng khu vực." action={<Button variant="secondary" onClick={() => { setQ(""); setFilters({ ...filters, industry: "Tất cả ngành", city: "Tất cả khu vực", verified: false }); }}>Xóa bộ lọc</Button>} />
        ) : (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {list.map((j) => (
              <JobCard key={j.id} {...j} selected={j.id === openId} saved={savedIds.includes(j.id)} onSave={() => toggleSave(j.id)} onClick={() => setOpenId(j.id)} />
            ))}
          </div>
        )}
        <Pagination page={page} total={5} onChange={setPage} summary={`1–${list.length} trong 248 tin`} />
      </div>
      {open ? (
        <div style={{ width: 460, flex: "none" }}>
          <JobDetail job={open} saved={savedIds.includes(open.id)} onSave={() => toggleSave(open.id)} onApply={() => setApplying(open)} onClose={() => setOpenId(null)} />
        </div>
      ) : null}
      {applying ? <ApplyDialog job={applying} onClose={() => setApplying(null)} onSend={() => { setApplying(null); onApplied(applying); }} /> : null}
    </div>
  );
}

Object.assign(window, { SearchScreen, JobDetail, ApplyDialog, FilterPanel });
