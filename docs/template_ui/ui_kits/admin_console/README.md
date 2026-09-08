# UI kit — Admin console

The platform moderator surface. Plum role tint on the `SideNav` rail, plus a persistent `RoleBadge` in the top bar — an admin should never be unsure which console they are in.

| File | Contents |
| --- | --- |
| `index.html` | Interactive shell with toasts on every moderation decision |
| `AdminShell.jsx` | Sample companies, moderation queue, users, `ATopBar`, `ALogo`, nav model |
| `AdminScreens.jsx` | Overview, company verification, job-post queue, users table, approval config |

## What is real vs. abbreviated
- Verification decisions and queue decisions mutate local state — approve a company and its badge changes; take down a post and it moves tabs.
- Document links are inert filenames; there is no viewer.
- "Cần kiểm tra" flags are static per record, not computed.
- The approval-config screen states plainly that AI features are not enabled — keep that copy if you extend the kit.
