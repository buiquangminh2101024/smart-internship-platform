# Trợ lý hồ sơ Candidate (gộp A1 + A4 + B2) — Frontend

Song song với `docs/06-backend/candidate-insights/PLAN.md` (schema, luồng chấm điểm, API, quyết định D1–D8 — **không chép lại ở đây**). Quyết định kiến trúc: AD-14 (đã cập nhật 2026-09-28). Phạm vi: **2 tính năng độc lập**:

1. Khu vực "Phân tích hồ sơ" ở `/candidate/profile` (LLM, có hạn mức) — giữ như thiết kế ban đầu.
2. Trang mới **"Việc làm phù hợp"** (không LLM, không hạn mức, tính live) — mới thêm sau khi tách B2 ra độc lập.

**Trạng thái (2026-09-28): FI-1/FI-2 ("Phân tích hồ sơ") và FI-3 ("Việc làm phù hợp") ĐÃ CODE, `tsc` + `next build` sạch. FI-4 (kiểm trên trình duyệt, checklist ở cuối file) — chủ dự án đã kiểm, chạy đúng. ⇒ HOÀN TẤT.**

## Quyết định mới chốt khi lên kế hoạch

1. **2 tính năng không phụ thuộc nhau, không tính năng nào yêu cầu cái kia chạy trước.** Candidate có thể mở "Việc làm phù hợp" mà chưa từng bấm "Phân tích hồ sơ".
2. **"Phân tích hồ sơ" đặt ở đầu `/candidate/profile`** (không phải trang riêng) — không tự động gọi khi vào trang, chỉ đọc kết quả cũ (`GET`); nút "Phân tích hồ sơ"/"Phân tích lại" mới gọi `POST` (tốn hạn mức).
3. **"Việc làm phù hợp" là trang riêng, tự chạy khi vào trang** (không có nút "bấm để tính") — vì không tốn LLM, xem bao nhiêu lần cũng được.
4. **`suggestions[]` hiển thị nhóm theo `kind`** (Cách viết / Kỹ năng nên bổ sung / Có thể bạn muốn cân nhắc).
5. **3 trạng thái rỗng của "Việc làm phù hợp" phải hiện khác nhau** (theo AD-14 mục 4): hồ sơ chưa có kỹ năng nào / có kỹ năng nhưng không tin nào đạt ngưỡng / (pool hẹp — xử lý ở BE, FE không cần biết).
6. **Không chặn/khoá gì**: mọi lỗi chỉ hiện thông báo cục bộ, không ảnh hưởng phần còn lại của trang.
7. Không thêm thư viện mới.

## Phần 1 — "Phân tích hồ sơ" (`/candidate/profile`)

### Hook — `apps/web/src/hooks/useCandidateProfileInsight.ts`

Cùng khuôn `useJobMatch.ts` (`useQuery`/`useMutation` của `@tanstack/react-query`, fetch qua `apiFetch<T>("candidate", path)`). **Lưu ý:** `CandidateProfileClient.tsx` — nơi gắn hook này — tự nó **không dùng react-query** cho state riêng (dùng thẳng `apiFetch` + `useState`); không sao vì `QueryClientProvider` đã bọc toàn app ở `app/provider.tsx`, hook mới chạy độc lập.

| Hook | Query key / mutation | Ghi chú |
|---|---|---|
| `useCandidateProfileInsight()` | `useQuery`, key `["candidate", "profile", "insights"]` | `GET /candidate/profile/insights`; `enabled` = đã đăng nhập và role `CANDIDATE`; trả `null` nếu chưa từng phân tích; **`retry: false`** |
| `useGenerateProfileInsight()` | `useMutation` | `POST /candidate/profile/insights`; không tự retry (mặc định của `useMutation`) — quan trọng vì tự động gọi lại sẽ tốn thêm hạn mức LLM ngoài ý muốn; `onSuccess` → `queryClient.setQueryData(["candidate", "profile", "insights"], response)` |

### Component — `components/candidate/ProfileInsightCard.tsx`

```text
┌─ Phân tích hồ sơ (AI) ─────────────────────────────────────────┐
│  Độ hoàn thiện hồ sơ: 75%   ▓▓▓▓▓▓▓▓░░                          │
│  Điểm mạnh                                                      │
│   • ...(2-3 câu do AI viết)...                                  │
│  Gợi ý cải thiện cách viết                                      │
│   • ...                                                         │
│  Kỹ năng nên bổ sung (dựa trên các tin phù hợp gần đây)         │
│   • Docker — xuất hiện ở 6/10 tin bạn có thể phù hợp            │
│  Có thể bạn muốn cân nhắc                                       │
│   • (INDUSTRY_MISMATCH, luôn kèm bằng chứng cụ thể)             │
│  Phân tích lần cuối: 10 phút trước        [Phân tích lại]       │
│  Gợi ý mang tính tham khảo, không phải lời khuyên nghề nghiệp.  │
└──────────────────────────────────────────────────────────────────┘
```

**Các trạng thái phải xử lý:**

| Trạng thái | Hiển thị |
|---|---|
| Chưa từng phân tích (`GET` trả `null`) | Khung giới thiệu ngắn + nút "Phân tích hồ sơ" |
| Đang tải `GET` | Skeleton |
| Đang chạy `POST` | Nút chuyển "Đang phân tích..." (disabled), giữ nguyên kết quả cũ bên dưới nếu có |
| Hết hạn mức (429) | Thông báo còn lại, không xoá kết quả cũ |
| Lỗi mạng/LLM | Toast lỗi, giữ nguyên kết quả cũ |
| Hồ sơ chưa có kỹ năng | Nút vẫn bấm được — backend vẫn trả `strengths`/`suggestions` loại `WRITING`, chỉ bỏ qua `SKILL_GAP`/`INDUSTRY_MISMATCH` (xem PLAN backend) |

### Thay đổi ở file hiện có

Trang thật là `app/(candidate)/profile/page.tsx`, nhưng file đó chỉ render `<CandidateProfileClient />` — component cần sửa là component này.

| File | Thay đổi |
|---|---|
| `components/candidate/CandidateProfileClient.tsx` | Chèn `<ProfileInsightCard />` trong `<div className="mx-auto grid max-w-4xl gap-6 px-6">`, **sau** khối tiêu đề "Hoàn thiện hồ sơ của bạn" và **trước** `<Section title="Thông tin cá nhân"...>` |

## Phần 2 — "Việc làm phù hợp" (trang mới)

### Hook — `apps/web/src/hooks/useJobRecommendations.ts` (hoặc thêm vào `useJobMatch.ts`)

| Hook | Query key | Ghi chú |
|---|---|---|
| `useJobRecommendations()` | `useQuery`, key `["candidate", "job-recommendations"]` | `GET /candidate/job-recommendations`; `enabled` = đã đăng nhập và role `CANDIDATE`; **tự chạy khi vào trang, không cần bấm gì**; `retry: false`; `staleTime` ngắn (30s, cùng lý do `useCandidateJobMatch` — sửa hồ sơ ở `/profile` không đi qua react-query nên không invalidate chéo được) |

### Trang mới — `app/(candidate)/jobs/recommended/page.tsx` (hoặc route tương đương, xác nhận lại theo cấu trúc route group `(candidate)` thật khi code)

- Danh sách tối đa 10 `JobCard` (tái dùng component list tin đã có ở trang `/jobs`, không viết lại từ đầu), mỗi thẻ có thêm badge điểm (`MatchScoreBadge` — component đã có ở job-matcher-phase1) và nhãn "Phù hợp X%".
- Link vào trang này đặt ở menu Candidate hoặc đầu trang `/jobs`, cạnh nút lọc — vị trí chính xác xác nhận khi code (không phải trọng tâm của PLAN).

**Các trạng thái phải xử lý (theo đúng 3 case AD-14 mục 4):**

| Trạng thái | Hiển thị |
|---|---|
| Đang tải | Skeleton danh sách |
| Hồ sơ chưa có kỹ năng (`INSUFFICIENT_PROFILE`) | Khung "Hãy thêm kỹ năng vào hồ sơ để xem việc làm phù hợp" + link `/profile` — **copy giống `JobMatchCard`**, không viết câu mới |
| Có hồ sơ, nhưng không tin nào đạt ngưỡng 20% (`[]`) | Khung khác: "Chưa có tin nào thực sự phù hợp với hồ sơ hiện tại — thử bổ sung thêm kỹ năng/kinh nghiệm hoặc quay lại sau." — **không dùng chung copy với case trên** |
| Có kết quả (1–10 tin) | Danh sách bình thường — **không hiện số lượng cố định "10"** trong UI copy (có thể ít hơn, không phải lỗi) |
| Lỗi mạng | Toast lỗi, không chặn phần còn lại của trang (nếu nhúng vào trang `/jobs` thay vì trang riêng) |

Không có nút "phân tích lại" ở phần này — mỗi lần vào trang tự tính mới (BE không cache danh sách).

### Thay đổi ở file hiện có

| File | Thay đổi |
|---|---|
| Trang/menu Candidate hiện có | Thêm link tới trang "Việc làm phù hợp" |
| `packages/shared-types` | Đồng bộ kiểu `ProfileInsight`, `ProfileInsightSuggestion`, `JobRecommendation` từ backend |

Không sửa các form Education/Skill/WorkExperience hiện có.

## Các bước thực hiện

### FI-1: Hook + component "Phân tích hồ sơ" (trạng thái tĩnh)

- Dựng `ProfileInsightCard` với dữ liệu giả để duyệt layout trước.

### FI-2: Nối API thật cho "Phân tích hồ sơ"

- `useCandidateProfileInsight` + `useGenerateProfileInsight`, gắn vào `CandidateProfileClient.tsx`.
- **Test:** tài khoản chưa từng phân tích ⇒ thấy nút giới thiệu; bấm phân tích ⇒ thấy kết quả đúng nhóm; tắt backend ⇒ trang hồ sơ vẫn dùng được bình thường; gọi > hạn mức ⇒ thấy đúng thông báo còn lại.

### FI-3: Trang "Việc làm phù hợp"

- `useJobRecommendations` + trang mới, tái dùng `JobCard`/`MatchScoreBadge` đã có.
- **Test:** tài khoản chưa có kỹ năng ⇒ đúng khung nhắc case `INSUFFICIENT_PROFILE`; tài khoản có kỹ năng nhưng cố tình không match tin nào (dữ liệu test) ⇒ đúng khung nhắc case "không đạt ngưỡng" (khác câu ở trên); tài khoản có hồ sơ tốt ⇒ thấy danh sách; **vào trang này lần đầu tiên trên tài khoản hoàn toàn mới (chưa từng xem tin, chưa từng phân tích)** ⇒ vẫn ra kết quả ngay, không trống, không lỗi (đúng cơ chế cold-start ở PLAN backend).

### FI-4: Kiểm thử trình duyệt thật + tài liệu

- `next build` sạch; kiểm thủ công cả 2 tính năng trên tài khoản có hồ sơ đầy đủ và tài khoản gần như trống.

## Ngoài phạm vi

- Trang riêng cho "Phân tích hồ sơ" (đặt chung `/profile`).
- Phân trang "Việc làm phù hợp" (D8 — chỉ top 10 cố định).
- Click vào 1 gợi ý `SKILL_GAP` để xổ ra đúng danh sách tin liên quan (ý tưởng đã nêu khi bàn thiết kế, chưa chốt làm — để ngỏ cho bản sau).
- Nút "Áp dụng gợi ý" tự sửa hồ sơ.

## Ghi chú triển khai

- **FI-3 (2026-09-28):** route là `app/(candidate)/recommended-jobs/page.tsx` ⇒ `/recommended-jobs` (không dùng `/jobs/recommended` để khỏi lồng vào route công khai `app/jobs/[id]`; cùng kiểu `/saved-jobs`). Component `components/candidate/JobRecommendationsClient.tsx`, hook `hooks/useJobRecommendations.ts` (nhận `JobRecommendationList = { status, items }`). Link "Việc làm phù hợp" thêm ở sidebar `CandidatePortalShell` và menu tài khoản `CandidateHomeHeader`; `proxy.ts` thêm `/recommended-jobs` vào `CANDIDATE_ONLY_PREFIXES`.
- `completenessScore` của "Phân tích hồ sơ" chỉ nhận các giá trị 0/10/25/35/…/100 theo trọng số D10 của PLAN backend (40/25/25/10).
- **FI-1/FI-2 (2026-09-28):** làm gộp, nối API thật luôn — bỏ bước dựng bằng dữ liệu giả. Hook `hooks/useCandidateProfileInsight.ts` (`useCandidateProfileInsight(enabled)` + `useGenerateProfileInsight()`), component `components/candidate/ProfileInsightCard.tsx`, chèn vào `CandidateProfileClient.tsx` giữa khối tiêu đề và mục "Thông tin cá nhân".
  - Kiểu dữ liệu thật: `ProfileInsight = { completenessScore, strengths, suggestions, basedOnJobCount, generatedAt }` (không có danh sách id tin); dòng cuối hiện "Phân tích lần cuối: … · dựa trên N tin tuyển dụng phù hợp" (ẩn phần N khi N = 0).
  - 429 ⇒ khung cảnh báo cố định trong thẻ (câu của backend, đã nói kết quả cũ được giữ), không dùng toast tự tắt; lỗi khác (503, mạng) ⇒ toast đỏ; thành công ⇒ toast xanh. Kết quả cũ luôn giữ nguyên khi lỗi.
  - `evidence`: `SKILL_GAP` giấu trong `<details>` "Xem tin liên quan"; `INDUSTRY_MISMATCH` hiện thẳng (bắt buộc kèm bằng chứng). Tối đa 3 dòng + "và N tin khác".
  - Hồ sơ không có chữ nào ⇒ backend trả `strengths`/`suggestions` rỗng ⇒ thẻ hiện câu nhắc bổ sung hồ sơ thay vì khung trống.

- **Ghi chú độ tin cậy trên thẻ "Việc làm phù hợp" (2026-09-28, chủ dự án chọn hướng B):** hồ sơ mỏng (vd. 1 kỹ năng, không kinh nghiệm/học vấn) có thể nhận tin **không khớp kỹ năng nào** mà vẫn qua ngưỡng 20%, vì các thành phần không áp dụng được bị chia lại trọng số và phần semantic chiếm ~48% (ví dụ thật: "Email Marketing" ⇒ tin Digital Marketing 33%, Content Marketing 27%, 0 kỹ năng khớp). **Không đổi công thức chấm** (dùng chung với trang tin và phía Employer); thay vào đó thẻ tin hiện dòng chú thích: 0 kỹ năng `MATCHED` ⇒ "Độ tin cậy thấp — bạn chưa có kỹ năng nào tin này yêu cầu, điểm chủ yếu dựa trên mức liên quan chung…"; còn lại mà `confidence = LOW` ⇒ "Độ tin cậy thấp — hồ sơ của bạn còn thiếu thông tin…". Hướng A (bắt buộc ≥ 1 kỹ năng khớp) và C (giới hạn điểm semantic khi không khớp kỹ năng) không làm.

## FI-4 — Checklist tự kiểm trên trình duyệt

Chuẩn bị: `npm run dev:server` + `npm run dev:web`; hai tài khoản Candidate — **A** hồ sơ đầy đủ (có kỹ năng, kinh nghiệm/dự án, bio), **B** gần như trống (không kỹ năng, không kinh nghiệm). `next build` đã sạch (2026-09-28), không cần chạy lại trừ khi sửa code.

Muốn test hết hạn mức nhanh: thêm `REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER=2` vào `.env` rồi khởi động lại server (**nhớ xoá dòng đó sau khi test**; không sửa default trong `env.ts`). Bộ đếm nằm ở Redis key `candidate-insight-quota:user:<userId>:day:<YYYY-MM-DD>` (ngày UTC) — xoá key đó để có lượt lại.

### "Phân tích hồ sơ" — `/profile`

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | A chưa từng phân tích, mở `/profile` | Thẻ "Phân tích hồ sơ" nằm trên "Thông tin cá nhân", câu giới thiệu + nút "Phân tích hồ sơ"; **không tự gọi POST** (tab Network chỉ có `GET /candidate/profile/insights`) |
| 2 | Bấm "Phân tích hồ sơ" | Nút thành "Đang phân tích..." (disabled, xoay); ~10 s sau hiện thanh độ hoàn thiện, "Điểm mạnh", "Gợi ý cải thiện cách viết" (và "Kỹ năng nên bổ sung"/"Có thể bạn muốn cân nhắc" nếu có), toast xanh; dòng cuối "Phân tích lần cuối: vừa xong · dựa trên N tin…" + nút "Phân tích lại" |
| 3 | F5 lại trang | Kết quả cũ hiện lại ngay (GET), không gọi POST |
| 4 | Sửa hồ sơ (vd. thêm kỹ năng) rồi "Phân tích lại" | Trong lúc chờ, kết quả cũ vẫn hiện; xong thì thay bằng kết quả mới |
| 5 | Bấm tới khi hết lượt | Khung vàng: "Bạn đã dùng hết N lượt phân tích hồ sơ trong hôm nay…"; kết quả cũ **vẫn còn** bên dưới |
| 6 | DevTools → Network → chuột phải request `POST /candidate/profile/insights` → *Block request URL*, bấm "Phân tích lại" | Toast đỏ, kết quả cũ giữ nguyên, các mục khác của `/profile` vẫn sửa/lưu được. Bỏ block sau khi xong |
| 7 | Block cả `GET /candidate/profile/insights`, F5 | Thẻ báo "Không tải được kết quả phân tích trước đó…" + nút; phần còn lại của trang hoạt động bình thường |
| 8 | B mở `/profile`, bấm "Phân tích hồ sơ" | Vẫn chạy (nút không bị khoá); độ hoàn thiện thấp; không có "Kỹ năng nên bổ sung"/"Có thể bạn muốn cân nhắc"; nếu hồ sơ hoàn toàn trống thì hiện câu nhắc bổ sung hồ sơ |
| 9 | Mở nhóm "Kỹ năng nên bổ sung" (nếu có) → "Xem tin liên quan" | Xổ ra tối đa 3 tin dạng "Tên tin (Công ty)" + "và N tin khác" |

### "Việc làm phù hợp" — `/recommended-jobs` (FI-3)

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 10 | A vào từ sidebar/menu "Việc làm phù hợp" (chưa bấm phân tích hồ sơ cũng được) | Skeleton rồi danh sách thẻ tin, mỗi thẻ có badge điểm + "Phù hợp X%", nút "Xem tin" mở đúng `/jobs/[id]` |
| 10b | Tài khoản chỉ có 1 kỹ năng không tin nào yêu cầu (vd. `a@a.com` — "Email Marketing") vào trang | Vẫn có thể ra vài tin; dưới mỗi tin có dòng "Độ tin cậy thấp — bạn chưa có kỹ năng nào tin này yêu cầu…" |
| 11 | B (không kỹ năng) vào trang | Khung "Hãy thêm kỹ năng vào hồ sơ để xem việc làm phù hợp." + nút "Cập nhật hồ sơ" |
| 12 | Tài khoản có kỹ năng nhưng không tin nào đạt 20% (vd. chỉ 1 kỹ năng hiếm) | Khung khác: "Chưa có tin nào thực sự phù hợp…" + 2 nút (câu chữ **khác** mục 11) |
| 13 | Block `GET /candidate/job-recommendations`, F5 | Thẻ lỗi "Không thể tải danh sách việc làm phù hợp…", trang không vỡ |
| 14 | Đăng xuất rồi gõ `/recommended-jobs` / `/profile` | Bị chặn/chuyển hướng giống các trang Candidate khác (vd. `/saved-jobs`) |

## Phần ghi chú của chủ dự án

*(để trống)*
