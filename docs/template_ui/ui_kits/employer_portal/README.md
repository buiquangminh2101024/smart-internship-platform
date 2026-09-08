# UI kit — Employer portal

The recruiter surface. Indigo role tint on the `SideNav` rail and workspace chip.

| File | Contents |
| --- | --- |
| `index.html` | Interactive shell: nav, lifecycle actions with toasts |
| `EmployerShell.jsx` | Sample posts and applicants, `ETopBar`, workspace `ELogo`, nav model |
| `JobScreens.jsx` | Dashboard, job-post table across all six lifecycle states, post editor |
| `PeopleScreens.jsx` | Applicant pipeline with detail panel, company profile & team |

## What is real vs. abbreviated
- Six posts cover every lifecycle state (draft, review, published, closed handled by action, expired, taken down); the table filters by state for real.
- Lifecycle buttons fire a toast rather than mutating state — the point is the vocabulary and placement.
- Applicant stage moves *are* real: shortlisting or rejecting moves the row between tabs.
- Messaging links to the candidate kit rather than duplicating the thread UI.
- **No match scores or candidate ranking.** The detail panel says so explicitly — that boundary is intentional.
