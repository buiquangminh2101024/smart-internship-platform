"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type CatalogItem = { id: string; name: string };
type Values = Record<string, string | boolean>;
type Profile = {
  headline?: string | null; bio?: string | null; phone?: string | null; dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null; avatarUrl?: string | null; cityId?: string | null;
  city?: CatalogItem | null; educations: Resource[]; workExperiences: Resource[]; projects: Resource[];
  certificates: Resource[]; awards: Resource[]; skills: Array<Resource & { skill: CatalogItem; yearsOfExperience: number }>;
};
type Resource = Record<string, unknown> & { id: string };

const inputClass = "w-full rounded-lg border border-border-default bg-white px-3 py-2.5 text-[15px] outline-none transition-colors placeholder:text-text-subtle focus:border-pine-500 focus:ring-2 focus:ring-pine-100";
const textareaClass = `${inputClass} min-h-24 resize-y`;

function dateInput(value: unknown): string {
  return typeof value === "string" && value ? value.slice(0, 10) : "";
}

function emptyToUndefined(values: Values): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === "" ? undefined : value]));
}

function Section({ title, description, children }: { title: string; description?: string | undefined; children: React.ReactNode }) {
  return (
    <Card className="grid gap-5" padding="lg">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">{title}</h2>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function CollectionSection({
  title, description, items, endpoint, initial, fromItem, renderFields, formatItem, refresh,
}: {
  title: string; description?: string; items: Resource[]; endpoint: string; initial: Values;
  fromItem: (item: Resource) => Values;
  renderFields: (values: Values, set: (key: string, value: string | boolean) => void) => React.ReactNode;
  formatItem: (item: Resource) => React.ReactNode;
  refresh: () => Promise<void>;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const reset = () => { setValues(initial); setEditing(null); setError(""); };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      await apiFetch("candidate", editing ? `${endpoint}/${editing}` : endpoint, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(emptyToUndefined(values)),
      });
      await refresh(); reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu thông tin.");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Xóa mục này khỏi hồ sơ?")) return;
    setError("");
    try { await apiFetch("candidate", `${endpoint}/${id}`, { method: "DELETE" }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xóa thông tin."); }
  }

  return (
    <Section title={title} description={description}>
      {items.length ? <div className="grid gap-2">{items.map((item) => (
        <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border-subtle p-3">
          <div className="min-w-0 flex-1 text-sm text-text-body">{formatItem(item)}</div>
          <Button size="sm" variant="ghost" icon="pencil" onClick={() => { setValues(fromItem(item)); setEditing(item.id); setError(""); }} />
          <Button size="sm" variant="ghost" icon="trash-2" className="text-red-600" onClick={() => void remove(item.id)} />
        </div>
      ))}</div> : <p className="text-sm text-text-muted">Chưa có thông tin.</p>}
      <form onSubmit={submit} className="grid gap-4 rounded-lg bg-surface-page p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-text-strong">{editing ? "Chỉnh sửa" : "Thêm mới"}</h3>{editing ? <Button type="button" size="sm" variant="ghost" onClick={reset}>Hủy</Button> : null}</div>
        {renderFields(values, set)}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" loading={saving} className="justify-self-start" icon={editing ? "save" : "plus"}>{editing ? "Lưu thay đổi" : "Thêm vào hồ sơ"}</Button>
      </form>
    </Section>
  );
}

export function CandidateProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalogs, setCatalogs] = useState<Record<string, CatalogItem[]>>({});
  const [loadError, setLoadError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [personal, setPersonal] = useState<Values>({ headline: "", bio: "", phone: "", dateOfBirth: "", gender: "", avatarUrl: "", cityId: "" });

  const refresh = useCallback(async () => {
    const data = await apiFetch<Profile>("candidate", "/candidates/me");
    setProfile(data);
    setPersonal({ headline: data.headline ?? "", bio: data.bio ?? "", phone: data.phone ?? "", dateOfBirth: dateInput(data.dateOfBirth), gender: data.gender ?? "", avatarUrl: data.avatarUrl ?? "", cityId: data.cityId ?? "" });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [, majors, universities, skills, cities] = await Promise.all([
          refresh(), apiFetch<CatalogItem[]>("candidate", "/catalog/majors"), apiFetch<CatalogItem[]>("candidate", "/catalog/universities"), apiFetch<CatalogItem[]>("candidate", "/catalog/skills"), apiFetch<CatalogItem[]>("candidate", "/catalog/cities"),
        ]);
        setCatalogs({ majors, universities, skills, cities });
      } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Không thể tải hồ sơ."); }
    })();
  }, [refresh]);

  const options = (key: string, label: string) => [{ value: "", label }, ...(catalogs[key] ?? []).map((item) => ({ value: item.id, label: item.name }))];
  const setPersonalValue = (key: string, value: string) => setPersonal((current) => ({ ...current, [key]: value }));

  async function savePersonal(event: React.FormEvent) {
    event.preventDefault(); setProfileSaving(true); setProfileError("");
    try { await apiFetch("candidate", "/candidates/me", { method: "PATCH", body: JSON.stringify(emptyToUndefined(personal)) }); await refresh(); }
    catch (cause) { setProfileError(cause instanceof Error ? cause.message : "Không thể lưu hồ sơ."); }
    finally { setProfileSaving(false); }
  }

  if (loadError) return <main className="mx-auto max-w-4xl px-6 py-16"><Card tone="warning"><p className="text-text-strong">{loadError}</p></Card></main>;
  if (!profile) return <main className="mx-auto max-w-4xl px-6 py-16 text-text-muted">Đang tải hồ sơ…</main>;

  return (
    <main className="min-h-screen bg-surface-page py-10">
      <div className="mx-auto grid max-w-4xl gap-6 px-6">
        <div><p className="text-sm font-semibold tracking-wider text-pine-600 uppercase">Hồ sơ ứng viên</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-strong">Hoàn thiện hồ sơ của bạn</h1><p className="mt-2 text-text-muted">Thông tin đầy đủ giúp nhà tuyển dụng hiểu rõ hơn về bạn.</p></div>

        <Section title="Thông tin cá nhân" description="Các thông tin cơ bản hiển thị trong hồ sơ ứng tuyển.">
          <form onSubmit={savePersonal} className="grid gap-4">
            <FormGrid>
              <Input label="Tiêu đề nghề nghiệp" value={String(personal.headline)} onChange={(e) => setPersonalValue("headline", e.target.value)} placeholder="Ví dụ: Sinh viên Kỹ thuật phần mềm" />
              <Input label="Số điện thoại" value={String(personal.phone)} onChange={(e) => setPersonalValue("phone", e.target.value)} placeholder="0912 345 678" />
              <Input label="Ngày sinh" type="date" value={String(personal.dateOfBirth)} onChange={(e) => setPersonalValue("dateOfBirth", e.target.value)} />
              <Select label="Giới tính" value={String(personal.gender)} onChange={(e) => setPersonalValue("gender", e.target.value)} options={[{ value: "", label: "Chưa chọn" }, { value: "MALE", label: "Nam" }, { value: "FEMALE", label: "Nữ" }, { value: "OTHER", label: "Khác" }]} />
              <Select label="Thành phố" value={String(personal.cityId)} onChange={(e) => setPersonalValue("cityId", e.target.value)} options={options("cities", "Chọn thành phố")} />
              <Input label="Liên kết ảnh đại diện" type="url" value={String(personal.avatarUrl)} onChange={(e) => setPersonalValue("avatarUrl", e.target.value)} placeholder="https://…" />
            </FormGrid>
            <label className="grid gap-1.5 text-sm font-medium text-text-body">Giới thiệu bản thân<textarea className={textareaClass} value={String(personal.bio)} onChange={(e) => setPersonalValue("bio", e.target.value)} maxLength={2000} placeholder="Điểm mạnh, định hướng nghề nghiệp và mục tiêu thực tập…" /></label>
            {profileError ? <p className="text-sm text-red-600">{profileError}</p> : null}
            <Button type="submit" loading={profileSaving} icon="save" className="justify-self-start">Lưu thông tin cá nhân</Button>
          </form>
        </Section>

        <CollectionSection title="Học vấn" description="Bạn có thể thêm lịch sử nhiều trường hoặc chương trình học." items={profile.educations} endpoint="/candidates/me/education" refresh={refresh}
          initial={{ universityId: "", majorId: "", degree: "", startYear: "", endYear: "", isCurrent: false, description: "" }}
          fromItem={(item) => ({ universityId: String(item.universityId ?? ""), majorId: String(item.majorId ?? ""), degree: String(item.degree ?? ""), startYear: String(item.startYear ?? ""), endYear: String(item.endYear ?? ""), isCurrent: Boolean(item.isCurrent), description: String(item.description ?? "") })}
          formatItem={(item) => <><p className="font-semibold text-text-strong">{String((item.university as CatalogItem | null)?.name ?? "Chưa chọn trường")}</p><p>{String((item.major as CatalogItem | null)?.name ?? "Chưa chọn ngành")}{item.degree ? ` · ${String(item.degree)}` : ""}</p><p className="text-text-muted">{String(item.startYear ?? "?")} – {item.isCurrent ? "Hiện tại" : String(item.endYear ?? "?")}</p></>}
          renderFields={(v, set) => <><FormGrid><Select label="Trường đại học" value={String(v.universityId)} onChange={(e) => set("universityId", e.target.value)} options={options("universities", "Chọn trường")} /><Select label="Chuyên ngành" value={String(v.majorId)} onChange={(e) => set("majorId", e.target.value)} options={options("majors", "Chọn ngành")} /><Input label="Bằng cấp" value={String(v.degree)} onChange={(e) => set("degree", e.target.value)} placeholder="Cử nhân" /><Input label="Năm bắt đầu" type="number" min="1900" max="2100" value={String(v.startYear)} onChange={(e) => set("startYear", e.target.value)} /><Input label="Năm kết thúc" type="number" min="1900" max="2100" disabled={Boolean(v.isCurrent)} value={String(v.endYear)} onChange={(e) => set("endYear", e.target.value)} /></FormGrid><label className="flex items-center gap-2 text-sm text-text-body"><input type="checkbox" checked={Boolean(v.isCurrent)} onChange={(e) => set("isCurrent", e.target.checked)} />Đang theo học chương trình này</label><label className="grid gap-1.5 text-sm font-medium text-text-body">Mô tả<textarea className={textareaClass} value={String(v.description)} onChange={(e) => set("description", e.target.value)} /></label></>}
        />

        <Section title="Kỹ năng" description="Chọn kỹ năng từ danh mục và cập nhật số năm kinh nghiệm.">
          <SkillSection items={profile.skills} skills={catalogs.skills ?? []} refresh={refresh} />
        </Section>

        <CollectionSection title="Kinh nghiệm làm việc" items={profile.workExperiences} endpoint="/candidates/me/work-experiences" refresh={refresh}
          initial={{ company: "", position: "", startDate: "", endDate: "", isCurrent: false, description: "" }} fromItem={(i) => ({ company: String(i.company ?? ""), position: String(i.position ?? ""), startDate: dateInput(i.startDate), endDate: dateInput(i.endDate), isCurrent: Boolean(i.isCurrent), description: String(i.description ?? "") })}
          formatItem={(i) => <><p className="font-semibold text-text-strong">{String(i.position)} · {String(i.company)}</p><p className="text-text-muted">{dateInput(i.startDate) || "?"} – {i.isCurrent ? "Hiện tại" : dateInput(i.endDate) || "?"}</p></>}
          renderFields={(v, set) => <><FormGrid><Input required label="Công ty" value={String(v.company)} onChange={(e) => set("company", e.target.value)} /><Input required label="Vị trí" value={String(v.position)} onChange={(e) => set("position", e.target.value)} /><Input label="Ngày bắt đầu" type="date" value={String(v.startDate)} onChange={(e) => set("startDate", e.target.value)} /><Input label="Ngày kết thúc" type="date" disabled={Boolean(v.isCurrent)} value={String(v.endDate)} onChange={(e) => set("endDate", e.target.value)} /></FormGrid><label className="flex items-center gap-2 text-sm text-text-body"><input type="checkbox" checked={Boolean(v.isCurrent)} onChange={(e) => set("isCurrent", e.target.checked)} />Đang làm việc tại đây</label><label className="grid gap-1.5 text-sm font-medium text-text-body">Mô tả<textarea className={textareaClass} value={String(v.description)} onChange={(e) => set("description", e.target.value)} /></label></>}
        />

        <CollectionSection title="Dự án nổi bật" items={profile.projects} endpoint="/candidates/me/projects" refresh={refresh}
          initial={{ name: "", url: "", startDate: "", endDate: "", isWorkingOn: false, description: "" }} fromItem={(i) => ({ name: String(i.name ?? ""), url: String(i.url ?? ""), startDate: dateInput(i.startDate), endDate: dateInput(i.endDate), isWorkingOn: Boolean(i.isWorkingOn), description: String(i.description ?? "") })}
          formatItem={(i) => <><p className="font-semibold text-text-strong">{String(i.name)}</p>{i.url ? <a className="text-pine-600 hover:underline" href={String(i.url)} target="_blank" rel="noreferrer">{String(i.url)}</a> : null}<p className="text-text-muted">{i.isWorkingOn ? "Đang thực hiện" : "Đã hoàn thành"}</p></>}
          renderFields={(v, set) => <><FormGrid><Input required label="Tên dự án" value={String(v.name)} onChange={(e) => set("name", e.target.value)} /><Input label="Liên kết dự án" type="url" value={String(v.url)} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /><Input label="Ngày bắt đầu" type="date" value={String(v.startDate)} onChange={(e) => set("startDate", e.target.value)} /><Input label="Ngày kết thúc" type="date" disabled={Boolean(v.isWorkingOn)} value={String(v.endDate)} onChange={(e) => set("endDate", e.target.value)} /></FormGrid><label className="flex items-center gap-2 text-sm text-text-body"><input type="checkbox" checked={Boolean(v.isWorkingOn)} onChange={(e) => set("isWorkingOn", e.target.checked)} />Đang thực hiện dự án này</label><label className="grid gap-1.5 text-sm font-medium text-text-body">Mô tả<textarea className={textareaClass} value={String(v.description)} onChange={(e) => set("description", e.target.value)} /></label></>}
        />

        <CollectionSection title="Chứng chỉ" items={profile.certificates} endpoint="/candidates/me/certificates" refresh={refresh}
          initial={{ name: "", issuer: "", issueDate: "", credentialUrl: "", description: "" }} fromItem={(i) => ({ name: String(i.name ?? ""), issuer: String(i.issuer ?? ""), issueDate: dateInput(i.issueDate), credentialUrl: String(i.credentialUrl ?? ""), description: String(i.description ?? "") })}
          formatItem={(i) => <><p className="font-semibold text-text-strong">{String(i.name)}</p><p>{String(i.issuer ?? "")}</p><p className="text-text-muted">{dateInput(i.issueDate)}</p></>}
          renderFields={(v, set) => <><FormGrid><Input required label="Tên chứng chỉ" value={String(v.name)} onChange={(e) => set("name", e.target.value)} /><Input label="Đơn vị cấp" value={String(v.issuer)} onChange={(e) => set("issuer", e.target.value)} /><Input label="Ngày cấp" type="date" value={String(v.issueDate)} onChange={(e) => set("issueDate", e.target.value)} /><Input label="Liên kết xác thực" type="url" value={String(v.credentialUrl)} onChange={(e) => set("credentialUrl", e.target.value)} /></FormGrid><label className="grid gap-1.5 text-sm font-medium text-text-body">Mô tả<textarea className={textareaClass} value={String(v.description)} onChange={(e) => set("description", e.target.value)} /></label></>}
        />

        <CollectionSection title="Giải thưởng" items={profile.awards} endpoint="/candidates/me/awards" refresh={refresh}
          initial={{ name: "", issuer: "", date: "", description: "" }} fromItem={(i) => ({ name: String(i.name ?? ""), issuer: String(i.issuer ?? ""), date: dateInput(i.date), description: String(i.description ?? "") })}
          formatItem={(i) => <><p className="font-semibold text-text-strong">{String(i.name)}</p><p>{String(i.issuer ?? "")}</p><p className="text-text-muted">{dateInput(i.date)}</p></>}
          renderFields={(v, set) => <><FormGrid><Input required label="Tên giải thưởng" value={String(v.name)} onChange={(e) => set("name", e.target.value)} /><Input label="Đơn vị trao" value={String(v.issuer)} onChange={(e) => set("issuer", e.target.value)} /><Input label="Ngày nhận" type="date" value={String(v.date)} onChange={(e) => set("date", e.target.value)} /></FormGrid><label className="grid gap-1.5 text-sm font-medium text-text-body">Mô tả<textarea className={textareaClass} value={String(v.description)} onChange={(e) => set("description", e.target.value)} /></label></>}
        />
      </div>
    </main>
  );
}

function SkillSection({ items, skills, refresh }: { items: Profile["skills"]; skills: CatalogItem[]; refresh: () => Promise<void> }) {
  const [skillId, setSkillId] = useState(""); const [years, setYears] = useState("0"); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await apiFetch("candidate", "/candidates/me/skills", { method: "POST", body: JSON.stringify({ skillId, yearsOfExperience: Number(years) }) }); await refresh(); setSkillId(""); setYears("0"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu kỹ năng."); } finally { setSaving(false); } }
  async function remove(id: string) { try { await apiFetch("candidate", `/candidates/me/skills/${id}`, { method: "DELETE" }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xóa kỹ năng."); } }
  return <><div className="flex flex-wrap gap-2">{items.length ? items.map((item) => <span key={item.skill.id} className="inline-flex items-center gap-2 rounded-full bg-pine-50 px-3 py-1.5 text-sm text-pine-800">{item.skill.name} <span className="text-pine-600">{item.yearsOfExperience} năm</span><button type="button" aria-label={`Xóa ${item.skill.name}`} className="text-pine-700 hover:text-red-600" onClick={() => void remove(item.skill.id)}>×</button></span>) : <p className="text-sm text-text-muted">Chưa có kỹ năng.</p>}</div><form onSubmit={submit} className="flex flex-col gap-3 rounded-lg bg-surface-page p-4 sm:flex-row"><Select className="flex-1" value={skillId} onChange={(e) => setSkillId(e.target.value)} options={[{ value: "", label: "Chọn kỹ năng" }, ...skills.map((skill) => ({ value: skill.id, label: skill.name }))]} required /><Input className="sm:w-36" type="number" min="0" max="60" step="0.5" value={years} onChange={(e) => setYears(e.target.value)} aria-label="Số năm kinh nghiệm" /><Button type="submit" loading={saving} disabled={!skillId} icon="plus">Thêm kỹ năng</Button></form>{error ? <p className="text-sm text-red-600">{error}</p> : null}</>;
}