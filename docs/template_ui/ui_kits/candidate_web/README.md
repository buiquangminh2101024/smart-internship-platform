# UI kit — Candidate web app

The signed-in student surface. Pine role tint on the `SideNav` rail.

| File | Contents |
| --- | --- |
| `index.html` | Interactive shell: nav switching, save-a-job, apply flow with toast |
| `CandidateShell.jsx` | Sample data (jobs, applications, threads), `TopBar`, `Logo`, nav model |
| `SearchScreen.jsx` | Filter panel, search bar, result list, job detail, apply dialog |
| `CandidateScreens.jsx` | Saved jobs, applications table, messaging, profile & CV |

## What is real vs. abbreviated
- Five sample postings stand in for a paged result set; `Pagination` shows the real component but does not re-slice data.
- Search/filters do filter the sample list; sort order is cosmetic.
- Messaging appends locally sent messages; there is no transport.
- **CV analysis and AI matching are deliberately absent.** The profile screen states that CV analysis is a later release — do not add match scores, rankings or "AI" affordances to this kit.

## Interactions worth clicking
1. Change **Ngành** or untick "Chỉ công ty đã xác thực" — the result list and the empty state respond.
2. Click a card → detail panel on the right; **Ứng tuyển ngay** → apply dialog → success toast.
3. Bookmark icon on any card → the count on **Tin đã lưu** updates.
4. **Tin nhắn** → pick a thread, type, Enter to send.
