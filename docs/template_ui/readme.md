# InternHub Design System

**Tagline:** Kết nối thực tập, mở đầu sự nghiệp. *(Connecting internships, starting careers.)*

InternHub is an internship recruitment platform for the Vietnamese market. It connects university students looking for internships with companies looking for interns, and gives a platform admin the tools to verify companies and moderate listings.

**Problem it solves.** Internship listings are scattered across Facebook groups, university boards and company sites, so students cannot tell what actually fits them; employers, in turn, cannot tell which applicants fit a role. InternHub centralises postings and candidate profiles, and puts every posting through one explicit lifecycle: **draft → review → published → closed / expired / taken down**, with a per-company approval workflow.

**Three actors, one lifecycle.**
| Actor | Surface | Colour |
| --- | --- | --- |
| Candidate (student) | Candidate web app | Pine (primary) |
| Employer (recruiter / HR) | Employer portal | Indigo |
| Admin (platform) | Admin console | Plum |

**Feature scope today:** candidate profile & CV management; job-post lifecycle with flexible moderation; search and filter by salary / industry / location; saved jobs; applications with status tracking; real-time messaging; in-app and email notifications.

**Explicitly not yet:** AI CV analysis, job matching, candidate ranking. The architecture leaves room for them, and this design system deliberately contains **no** match scores, ranking meters, "AI" badges, robot/brain iconography or gradient "intelligence" motifs. Several screens say in plain Vietnamese that automated analysis is not available yet. Keep that discipline — adding it early would misrepresent the product.

## Sources given to me
- `uploads/internhub-logo-vector-full.svg` — the only supplied asset: the InternHub lockup (mark + wordmark + tagline) in a coral-red palette. Preserved verbatim at `assets/logo-full-coral.svg`.
- The written brief (company description, audience, feature list, tagline, design notes) — reproduced above.
- **No codebase, no Figma file, no deck, no photography, no font binaries were provided.** Everything below the logo geometry is authored from the brief. The component inventory is therefore a from-scratch standard set sized to the product (see *Components*), not a recreation of an existing library.
- Per the brief's instruction to explore a different palette, the coral was replaced with **Pine + Marigold**. The logo geometry was recoloured accordingly (`assets/logo-full.svg`); the original coral file is kept for reference.

---

## CONTENT FUNDAMENTALS

**Language.** Vietnamese first, always. Every label, button, empty state and error in the product ships in Vietnamese; English appears only inside technical identifiers (`JOB-2026-00418`) and job-skill names that Vietnamese speakers use untranslated (React, SQL, Figma, Manual QA). Do not machine-translate skill names.

**Person and address.** Address the user as **bạn**. The platform never refers to itself in first person — no "tôi", no "chúng tôi giúp bạn…" in UI copy (the marketing site may use "chúng tôi" once, in the About column). Employers are "nhà tuyển dụng", students are "ứng viên" or "sinh viên", the moderator is "Admin".

- ✅ "Hồ sơ của bạn đã được gửi. Nhà tuyển dụng thường phản hồi trong 5 ngày."
- ❌ "Chúng tôi đã gửi hồ sơ của bạn thành công! 🎉"

**Casing.** Sentence case everywhere — buttons, labels, headings, table headers. Title Case is never used in Vietnamese UI. The single exception is the eyebrow style (`--type-eyebrow`), which is uppercase with `--tracking-caps`, used for section labels and table column heads.

**Punctuation.** Full stops on sentences, including hints and toast descriptions. **No exclamation marks.** No ALL-CAPS shouting. Vietnamese spacing conventions: no space before `:` or `,`; a space before the `₫` symbol; dot as thousands separator (`4.000.000 ₫`); en dash with spaces for ranges (`4 – 6 triệu / tháng`); dates as `DD/MM/YYYY`.

**Emoji: never.** Not in UI, not in marketing, not in notifications. Icons carry that load.

**Tone.** Plain, specific, slightly formal — the register of a good university careers office. It respects that a student's first internship matters and that a recruiter is at work. It never hypes, never congratulates, never uses startup-speak ("unlock", "supercharge", "AI-powered").

**Button labels** are verb-first and concrete: "Ứng tuyển ngay", "Lưu tin", "Gửi duyệt", "Duyệt tin", "Hạ tin", "Xác thực doanh nghiệp". Never "OK", "Submit", "Continue".

**Empty states** name the fact, then the fix — never an apology:
> **Không tìm thấy tin phù hợp** · Thử bỏ bộ lọc mức lương hoặc mở rộng khu vực.

**Errors** are one short sentence, no blame, with the correction: "Vui lòng nhập số, ví dụ 4000000."

**Status words are fixed vocabulary.** Nháp · Chờ duyệt · Đang hiển thị · Đã đóng · Hết hạn · Đã hạ. Import them from `StatusPill`'s `statusVocabulary` rather than retyping — synonyms across screens are the fastest way to lose a moderation product's credibility.

**Numbers over adjectives.** "1.240 doanh nghiệp đã xác thực" beats "rất nhiều doanh nghiệp uy tín". Every marketing claim in this system is a countable one.

---

## VISUAL FOUNDATIONS

**The feeling to hit:** a serious tool that a 20-year-old is not afraid of. Calm, dense, well-lit, no ornament. Closer to a well-made banking dashboard than to a consumer job app — but with generous type and rounded-enough corners that it never feels bureaucratic.

### Colour
- **Pine** (`--pine-500` #0E7A67) is the primary: every primary button, active nav item, focus ring, selected state and brand surface. Deliberately not the recruitment-industry default blue; green reads as growth and steadiness in the Vietnamese market without being naïve.
- **Marigold** (`--marigold-300/500`) is the *only* warm accent: "waiting on a human" (review states), highlights, and marketing CTAs. Never a primary in-app action, never destructive.
- **Role hues** — Pine (candidate), Indigo `--indigo-500`, Plum `--plum-500` — appear only as a 3px `SideNav` rail inset, the active nav item tint, `RoleBadge`, and the avatar ring. Never a page background.
- **Neutrals** are a slate with a trace of green so they sit calmly under Pine. Text: 900 strong / 700 body / 500 muted / 400 subtle.
- **Maximum two background colours per screen**: `--surface-page` (#F4F6F6) for the well, `--surface-card` white for content. `--surface-brand-deep` (#063B33) is the third, reserved for the marketing hero/footer and signed-out shells.
- Semantic colours are soft-fill + dark-ink pairs, never saturated blocks of colour behind body text.

### Type
- One family, **Be Vietnam Pro** (300–800), for display through UI — chosen for complete Vietnamese diacritic coverage. **JetBrains Mono** for IDs, timestamps, money and any numeric column (`font-variant-numeric: tabular-nums`).
- Scale: 11 · 12 · 13 · 15 · 16 · 18 · 20 · 24 · 30 · 36 · 46 · 58. **15px is the body default**, 13px the UI floor. Never below 13px: stacked Vietnamese tone marks are the first thing to clip.
- Line heights are generous for the same reason — 1.18 tight display, 1.32 headings, 1.55 body.
- Weights do the hierarchy work: 800 display, 700 headings, 600 labels/buttons, 500 meta, 400 body. Italics are not used.
- Letter-spacing: −0.02em on display, 0 on body, +0.08em only on uppercase eyebrows.

### Space & layout
- 4px grid. 8px inside controls, 12–16px inside cards, 24px between cards and panels, 48–80px between marketing sections.
- App shell is fixed: 248px `SideNav`, 64px top bar, content max 1240px, prose max 68ch. Two-pane list/detail is the house pattern (search + detail, applicants + detail, verification + detail) with the detail pane sticky at `--space-6`.
- Controls: 32 / 40 / 48px, 40px default; 44px minimum touch target on mobile surfaces.

### Corners, borders, cards
- Radii: 3 (checkbox) · 6 · 8 (controls) · **10 (cards — the house radius)** · 14 (dialogs) · 20 · pill (status pills, avatars, toggles).
- Borders are 1px `--border-subtle` (#E8ECEB) on cards, `--border-default` (#D5DBDA) on inputs; 2px only for checkboxes and the active tab underline.
- **A card is:** white, 1px subtle border, 10px radius, `--shadow-xs`. That's it. Cards never nest shadows — an inner region becomes `tone="sunken"` (grey, borderless) instead. No coloured left-border cards anywhere except `Toast`, which owns that pattern (3px tone bar).

### Elevation
`--shadow-xs` rest → `md` hover → `lg` floating (toast, popover) → `xl` modal only. All shadows are neutral-tinted rgba(18,25,23,…) — never black, never a coloured glow. Modals sit on `--surface-overlay` (rgba dark, 52%) with a 6px backdrop blur; the sticky marketing header uses `--blur-glass` over 92% white. Transparency and blur appear **only** in those two places.

### Backgrounds & imagery
No gradients as decoration. The only gradients in the system are protection scrims: `--scrim-bottom` for text over photography and `--scrim-brand` for the deep-Pine hero panel. No patterns, no textures, no hand-drawn illustration, no generated art.
**Imagery direction (not yet supplied):** real, warm-neutral photography of Vietnamese students and workplaces, natural light, candid rather than posed, shallow-but-not-blurred depth, no grain, no colour filters. Full-bleed only in the marketing hero; inside the product, imagery is limited to avatars and company logos. Until real photos exist, `Photo` placeholders in the marketing kit state what shot belongs there.

### Motion
Short and functional: **120ms** control feedback, **180ms** surfaces and tab switches, **260ms** overlays entering. One easing curve, `--ease-standard` cubic-bezier(.2,0,.2,1). Nothing bounces, springs, pulses, parallaxes or loops. `prefers-reduced-motion` collapses everything to near-zero (handled in `tokens/base.css`).

### States
- **Hover:** one step darker on filled actions (`--pine-500` → 600), `--surface-hover` grey wash on ghost/rows, and cards go `xs` → `md` shadow. Never opacity fades, never scale-up.
- **Press:** two steps darker (700) plus a 0.5px downward nudge and `brightness(0.96)`. No shrink.
- **Focus:** 1px `--border-focus` plus a 3px translucent Pine ring (`--ring-focus`); keyboard focus also gets a 2px Pine outline with 2px offset. Focus is never removed.
- **Selected:** Pine-50 fill + Pine-500 border (list rows, tabs, active nav, toggled icon buttons).
- **Disabled:** `--surface-disabled` fill, `--text-subtle` ink, no shadow, `not-allowed` cursor. Never below 40% perceived contrast on text.
- **Loading:** the button keeps its size and swaps the leading icon; no skeleton shimmer animation.

### Fixed elements
Sticky: marketing header (blurred), detail panes, table headers on long lists. Toasts are fixed bottom-right at `--space-6`, 380px wide, one at a time.

---

## ICONOGRAPHY

**System: Lucide**, at the pinned version `lucide-static@0.544.0`, loaded from jsDelivr by the `Icon` component (it fetches each icon's SVG and caches it, so glyphs inherit `currentColor`).

> ⚠️ **Substitution flagged:** no icon set was supplied with the brief. Lucide was chosen for its 1.5–2px open stroke style, complete coverage of recruitment concepts (briefcase, badge-check, file-user, shield-check) and permissive licence. If InternHub has its own icon set, drop the SVGs into `assets/icons/` and repoint `Icon`.

**Rules**
- Stroke icons only, **1.75** stroke weight (slightly lighter than Lucide's default 2), never filled, never two-tone.
- Sizes: 13–14px inside badges and meta rows, 16px inline with text, **18px in controls and nav** (the default), 20–22px standalone or in a tinted tile.
- Icons never carry meaning alone — always paired with a label, except in `IconButton`, which requires a `label` prop for its accessible name and tooltip.
- Icons inherit `currentColor`; colour the parent. Icons are `--text-muted` at rest, role/brand colour when active.
- **No emoji, ever.** No Unicode dingbats as icons. The only decorative Unicode in use is the middle dot `·` as a metadata separator and the en dash `–` in ranges.
- Do not hand-roll SVG icons for new needs — add the Lucide name.

**Canonical glyphs** (use these, consistently): `search` search · `briefcase` job post · `bookmark` saved · `send` application sent · `message-square` messages · `file-user` profile/CV · `file-text` document · `badge-check` verified company · `shield-check` admin/verification · `file-check-2` moderation queue · `flag` report · `building-2` company · `graduation-cap` student · `users` applicants · `map-pin` location · `wallet` salary · `calendar-clock` deadline · `clock` awaiting review · `circle-check` published · `archive` closed · `calendar-x` expired · `shield-alert` taken down · `layout-dashboard` overview · `settings` config.

**Logo assets** (`assets/`) — geometry is the user's supplied mark, recoloured; nothing was drawn from scratch:
| File | Use |
| --- | --- |
| `logo-full.svg` | Primary lockup, Pine palette, light backgrounds |
| `logo-full-inverse.svg` | Lockup for `--surface-brand-deep` / dark |
| `logo-full-coral.svg` | The original supplied coral lockup, kept for reference |
| `logo-mark.svg` | Mark only, Pine + Marigold bridge |
| `logo-mark-white.svg` | Mark only, for dark backgrounds |
| `logo-mark-mono.svg` | Single-colour mark, inherits `currentColor` (inline SVG only) |
| `logo-wordmark.svg` | Wordmark only, for tight app headers |

Clear space around the lockup equals the height of the mark's head circle. Minimum lockup width 180px; below that use the mark alone. Do not stretch, re-hue outside the approved variants, or place the light lockup on a mid-tone photograph without a scrim.

---

## FONTS — substitution flagged

No font binaries were supplied. `tokens/fonts.css` loads **Be Vietnam Pro** and **JetBrains Mono** from Google Fonts (both with full Vietnamese coverage) instead of local `@font-face` rules. **If InternHub has licensed brand fonts, please send the files** — I will add real `@font-face` rules and self-host them. Note the compiler reports "0 fonts" for this system precisely because the faces come from a Google Fonts `@import` rather than declared `@font-face` blocks.

---

## Index

**Root**
- `styles.css` — the single entry point consumers link. `@import` list only.
- `readme.md` — this file. `SKILL.md` — Agent-Skills wrapper. `thumbnail.html` — homepage tile.

**Tokens** (`tokens/`, all reached from `styles.css`)
`fonts.css` · `colors.css` (ramps, semantic aliases, roles, lifecycle) · `typography.css` (scale + `--type-*` roles) · `spacing.css` (space, radii, controls, layout) · `elevation.css` (shadows, blur, scrims) · `motion.css` · `base.css` (element resets, link colours, focus, reduced-motion).

**Assets** (`assets/`) — seven logo files, listed above. No photography, no icon binaries (Lucide via CDN).

**Guidelines** (`guidelines/`) — 22 specimen cards feeding the Design System tab: colours (primary, neutral, accent, roles, semantic, lifecycle, surfaces), type (display, body, UI, mono, Vietnamese diacritics), spacing (scale, radii, controls, layout), effects (shadows, states, motion), brand (logo, variants, voice).

**Components** (`components/`) — 19 primitives, each with `.jsx`, `.d.ts`, `.prompt.md`, plus one `@dsCard` per directory.
- `core/` — Button, IconButton, Icon, Card, Badge, Avatar
- `forms/` — Input (+ exported `Field`), Textarea, Select, Checkbox, Switch
- `navigation/` — Tabs, SideNav, Pagination
- `feedback/` — StatusPill (+ `statusVocabulary`), EmptyState, Toast
- `domain/` — JobCard, RoleBadge (+ `roleVocabulary`), StatCard

**Templates** (`templates/`) — starting folders a consuming project can copy:
- `app-screen/AppScreen.dc.html` — the authenticated shell (role-tinted rail, top bar, job list, side panel) with a `role` tweak that switches Candidate / Employer / Admin. `ds-base.js` alongside it loads `styles.css` + the compiled bundle.
- The four UI-kit screens below can also be converted into templates on request — say the word and I'll move them into `templates/`.

**UI kits** (`ui_kits/`) — four products, each with its own README:
- `candidate_web/` — student shell: search + filters + job detail + apply, saved jobs, applications, messaging, profile & CV
- `employer_portal/` — recruiter shell: dashboard, lifecycle table, post editor, applicant pipeline, company & team
- `admin_console/` — admin shell: overview, company verification, moderation queue, users, approval config
- `marketing_site/` — public landing page

### Intentional additions
No source defined a component inventory, so the set is a standard one sized to this product. Three additions are domain-specific rather than generic primitives, and exist because the same object appears in all three apps:
- **StatusPill** — the job-post lifecycle is the core domain concept; one component keeps its six words and colours identical across roles.
- **RoleBadge** — the brief calls for clear visual distinction between Candidate / Employer / Admin.
- **JobCard** — the single most repeated object in the product; re-implementing it per kit would guarantee drift.
- **SideNav** is also included (rather than left to each kit) because the role tint lives there.

### Known gaps
Dialog/Modal, Tooltip, Dropdown menu, Combobox (searchable select), Date picker, Table (the kits use plain `<table>` with token styling), Breadcrumb, File-upload control, and a mobile shell are **not** components yet — the kits inline what they needed. A dark theme is not defined (`color-scheme: light` only).
