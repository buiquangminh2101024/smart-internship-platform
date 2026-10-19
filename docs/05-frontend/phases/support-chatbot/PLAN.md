# Chatbot hỗ trợ người dùng (F1) — Frontend

Song song với `docs/06-backend/support-chatbot/PLAN.md` (pipeline, API, SSE, quyết định D1–D13 — **không chép lại ở đây**). Quyết định kiến trúc: bản nháp AD-21 ở cuối plan backend.

**Trạng thái (2026-10-19): PLAN — chưa triển khai.**

## Quyết định phía frontend

1. **Một widget nổi duy nhất**, gắn ở gốc app (`app/provider.tsx`), tự quyết định hiện hay ẩn theo đường dẫn. Không gắn riêng vào từng shell.
2. **Hiện ở:** trang công khai (`/`, `/jobs`, `/companies`, `/employer` giới thiệu…), trang auth (`/login`, `/register`, `/forgot-password` — khách hay cần hỏi ở đây), khu Candidate, khu Employer.
   **Ẩn ở:** `/admin*`; trang nhắn tin `/messages`, `/employer/messages` (tránh đè khung chat thật); `/cv/editor` (trình soạn toàn màn hình); `/employer/subscription/return/*` (trang trả về từ cổng thanh toán); `/support` (đã là trang liên hệ). Danh sách đặt trong một hằng số, chỉnh lại khi kiểm trên trình duyệt.
3. **Token theo khu vực:** dùng `areaForPath(pathname)` (`lib/auth-area.ts`), lấy access token của area đó nếu có; không có thì gửi như khách. Cùng quy tắc AD-4, không đọc chéo area.
4. **Lịch sử ở `sessionStorage`** (D2 backend), key `sip-support-chat:{area}:{userId | "guest"}`. Chỉ lưu `{ role, text }` + `source`/`sources` để hiển thị lại; gửi lên server tối đa 10 tin gần nhất (chỉ `role` + `text`). Đọc/ghi bọc `try/catch` — storage bị chặn thì chat vẫn chạy, chỉ không nhớ khi reload.
5. **Xoá lịch sử khi đăng xuất — không sửa `stores/auth-store.ts`.** `SupportChatRoot` luôn được gắn ở `provider.tsx` (kể cả ở trang ẩn widget) và làm hai việc:
   - **Lắng nghe** auth store của cả 3 khu vực (`authStoreForArea(area).subscribe`): `user` chuyển từ có sang `null` ⇒ xoá mọi key lịch sử của user đó ở khu vực đó.
   - **Quét khi khởi động:** duyệt các key `sip-support-chat:*` trong `sessionStorage`, xoá key của user không còn đăng nhập ở khu vực tương ứng. Bước này bắt được cả những lần đăng xuất lỡ bị bỏ sót (vd. hết phiên lúc widget chưa gắn).

   Chiều phụ thuộc: chatbot biết auth, auth không biết chatbot. Đổi tài khoản trong cùng tab thì key khác nên không thấy hội thoại cũ. **Lưu ý khi sửa sau này:** không chuyển `SupportChatRoot` vào chỗ chỉ render có điều kiện, nếu không việc lắng nghe sẽ ngừng (bước quét khi khởi động vẫn còn làm lưới an toàn).
6. **Streaming bằng `fetch` + `ReadableStream`**, không dùng `EventSource` (không gửi được POST và header `Authorization`), không dùng axios (trình duyệt không stream được qua axios). Tự parse SSE (tách theo dòng trống) — vài chục dòng, **không thêm thư viện**.
7. **Hiển thị câu trả lời an toàn:** không `dangerouslySetInnerHTML`, không thêm thư viện markdown. Một formatter nhỏ chỉ hiểu: đoạn văn, dòng bắt đầu bằng `- `, `**đậm**`, và link nội bộ (bắt đầu bằng `/`, render bằng `next/link`). Mọi thứ khác là text thường. Trong lúc đang stream render text thô (tránh nhấp nháy `**` chưa đóng), nhận `done` mới định dạng.
8. **Không có hành động ghi** nào trong widget (khớp D12). Không 👍/👎 (D11).
9. Theo `sip-ui`: chỉ dùng token, giọng văn "bạn", không emoji, không dấu chấm than. **Không dùng icon hay ngôn ngữ kiểu robot/AI/brain** — biểu tượng mở widget là `message-circle-question` (Lucide), tên hiển thị là **"Trợ lý InternHub"**.
10. Màu theo khu vực: thẻ bọc widget đặt `data-role` theo area (Candidate/khách = mặc định Pine, Employer = `employer`), vì widget nằm ngoài shell nên không tự thừa hưởng `data-role` của shell.
11. Không thêm thư viện mới.

## Bố cục

### Desktop (≥ `sm`)

```text
                                     ┌─ Trợ lý InternHub ────────── [⟲] [×] ┐
                                     │                                      │
                                     │  Xin chào. Bạn cần hỗ trợ gì về      │
                                     │  InternHub?                          │
                                     │  [Cách đăng tin tuyển dụng]          │
                                     │  [Các gói dịch vụ khác nhau ra sao]  │
                                     │  [Vì sao tài khoản bị khoá]          │
                                     │                                      │
                                     │                ┌──────────────────┐  │
                                     │                │ Gói Pro giá bao  │  │
                                     │                │ nhiêu?           │  │
                                     │                └──────────────────┘  │
                                     │  ┌──────────────────────────────┐    │
                                     │  │ Gói Pro có giá ...           │    │
                                     │  │ Nguồn: Các gói dịch vụ       │    │
                                     │  └──────────────────────────────┘    │
                                     ├──────────────────────────────────────┤
                                     │ [ Nhập câu hỏi...            ] [Gửi] │
                                     │ Trả lời dựa trên tài liệu hướng dẫn  │
                                     │ của InternHub. Cần người hỗ trợ?     │
                                     │ Liên hệ hỗ trợ                       │
                                     └──────────────────────────────────────┘
                                                                     (◉)  ← nút mở
```

- Nút mở: tròn 56px, góc phải dưới, cách mép 24px, `bg-brand-600`, icon trắng, `aria-label="Mở trợ lý InternHub"`. Khi panel mở thì nút đổi thành icon `x`.
- Panel: rộng 380px, cao `min(600px, 100dvh - 120px)`, `Card` nền `surface-card`, viền `border-subtle`, bo `rounded-xl`, đặt ngay trên nút mở. `z-40` (dưới `Toast` `z-50`).
- Header: tiêu đề + nút "Cuộc trò chuyện mới" (icon `rotate-ccw`, có `aria-label`, xoá lịch sử của key hiện tại) + nút đóng.
- Tin người dùng: căn phải, nền `brand-50`. Tin trợ lý: căn trái, nền `surface-page`. Dưới tin trợ lý có dòng "Nguồn: …" (tên mục FAQ, chữ `text-muted`, 13px) khi `sources` không rỗng.
- Khi `suggestSupport = true`: dưới tin hiện `Button variant="link"` "Liên hệ hỗ trợ" → `/support`.
- Câu gợi ý (`GET /support/chat/suggestions`): hiện dạng chip khi hội thoại trống. Bấm chip ⇒ gửi kèm `faqId`.
- Footer: ô nhập `Textarea` 1–4 dòng tự giãn, Enter gửi, Shift+Enter xuống dòng, đếm ký tự khi > 400/500. Nút "Gửi" (`Button size="sm"`, icon `send`). Đang stream ⇒ nút đổi thành "Dừng" (huỷ request).

### Mobile (< `sm`, kiểm ở 375px)

- Panel mở **toàn màn hình** (`fixed inset-0`), header có nút đóng rõ ràng. Ô nhập dính đáy, dùng `100dvh` để không bị bàn phím ảo che.
- Nút mở nhỏ hơn (48px), cách mép 16px. Kiểm tra không đè nút hành động chính ở đáy các trang (vd. nút "Ứng tuyển" ở `/jobs/[id]`); đè thì nâng nút mở lên ở trang đó qua một biến CSS.

## Trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Đang chờ mẩu chữ đầu | Tin trợ lý tạm với 3 chấm "Đang soạn câu trả lời" (`aria-hidden`, chữ cho trình đọc màn hình nằm ở vùng live) |
| Đang stream | Chữ hiện dần (text thô), nút Gửi thành "Dừng" |
| Xong | Định dạng lại, hiện nguồn, focus giữ ở ô nhập |
| Người dùng bấm Dừng | Giữ phần chữ đã nhận, thêm dòng "Đã dừng" `text-muted` |
| 429 | Tin hệ thống: "Bạn gửi hơi nhanh. Thử lại sau ít phút." |
| 503 (tắt chatbot) | Ẩn nút mở (xác định qua lời gọi gợi ý lúc mở trang) |
| `event: error` giữa chừng | Giữ phần đã nhận, thêm "Câu trả lời bị gián đoạn." + nút "Thử lại" (gửi lại câu hỏi đó) |
| Lỗi mạng | "Không kết nối được. Kiểm tra mạng rồi thử lại." + nút "Thử lại" |
| `sessionStorage` không dùng được | Chat bình thường, không báo gì |

Tin lỗi và trạng thái hệ thống **không** lưu vào lịch sử gửi lên server.

## Xác thực khi stream

- Có token ⇒ gửi `Authorization: Bearer …`.
- Server trả 401 ⇒ gọi `refreshAccessTokenShared(area)` (đã export sẵn ở `lib/api-client.ts`), gửi lại **một lần**.
- Refresh thất bại ⇒ gọi `authStoreForArea(area).getState().clear()` (store đã public). **Không** dùng `endSession` của `api-client.ts` vì hàm đó chuyển về trang chủ, làm mất câu hỏi đang gõ; nếu phần khác của trang gặp 401 thì `apiFetch` của chúng vẫn tự chuyển trang như cũ. Không sửa `api-client.ts`.
- Sau đó hiện tin hệ thống "Phiên đăng nhập đã hết hạn. Câu trả lời dưới đây chỉ dựa trên tài liệu chung; đăng nhập lại để hỏi về dữ liệu của bạn." rồi gửi lại câu hỏi **như khách**. Không âm thầm hạ xuống khách — ở GĐ2 khách không có tool, người dùng cần biết vì sao bot không trả lời được câu hỏi về dữ liệu của họ.
- 401 chỉ có thể xảy ra trước khi mở stream (backend kiểm token trước), nên không có trường hợp đang stream thì hết phiên.

## Accessibility

- Panel là `role="dialog"` **không modal** trên desktop (`aria-modal="false"`, vẫn dùng được trang phía sau), modal trên mobile (toàn màn hình). Esc đóng panel, focus trả về nút mở.
- Mở panel ⇒ focus vào ô nhập.
- Danh sách tin **không** đặt `aria-live` (stream từng mẩu sẽ làm trình đọc màn hình đọc vụn). Một vùng `sr-only` `aria-live="polite"` riêng chỉ đọc câu trả lời hoàn chỉnh khi nhận `done`.
- Mọi nút chỉ có icon có `aria-label`. Chip gợi ý là `button`. Tương phản kiểm theo token (`brand-600` trên trắng, chữ `text-body` trên `brand-50`).
- `prefers-reduced-motion`: tắt hiệu ứng mở panel và 3 chấm.

## Cấu trúc file

```text
apps/web/src/components/support-chat/
├─ SupportChatRoot.tsx          # đọc pathname → ẩn/hiện; xác định area, token, data-role; lắng nghe auth store + quét khi khởi động (quyết định 5)
├─ SupportChatLauncher.tsx      # nút nổi
├─ SupportChatPanel.tsx         # header, danh sách tin, chip gợi ý, ô nhập, footer
├─ SupportChatMessage.tsx       # một tin (người dùng / trợ lý / hệ thống) + nguồn + link hỗ trợ
└─ SupportChatSuggestions.tsx   # chip câu gợi ý

apps/web/src/hooks/useSupportChat.ts        # state hội thoại, gửi, dừng, thử lại, đồng bộ sessionStorage
apps/web/src/hooks/useSupportChatSuggestions.ts  # useQuery GET /support/chat/suggestions, staleTime dài

apps/web/src/lib/support-chat-stream.ts     # fetch + parse SSE → async iterator SupportChatEvent; refresh 401 một lần
apps/web/src/lib/support-chat-storage.ts    # đọc/ghi/xoá sessionStorage (try/catch), clearSupportChatHistory(area)
apps/web/src/lib/support-chat-format.tsx    # formatter an toàn (quyết định 7)
apps/web/src/lib/support-chat-routes.ts     # danh sách đường dẫn ẩn widget (quyết định 2)
```

Sửa thêm (additive): chỉ `app/provider.tsx` (gắn `<SupportChatRoot />` trong `QueryClientProvider`). **Không sửa** `stores/auth-store.ts` và `lib/api-client.ts`. Kiểu dữ liệu lấy từ `@sip/shared-types` (backend thêm).

### Hook `useSupportChat(area)`

```ts
interface SupportChatState {
  messages: SupportChatUiMessage[];      // { id, role: "user" | "assistant" | "system", text, source?, sources?, suggestSupport?, status }
  status: "idle" | "waiting" | "streaming" | "error";
  send(text: string, faqId?: string): Promise<void>;
  stop(): void;                          // AbortController.abort()
  retry(): void;                         // gửi lại câu hỏi cuối
  reset(): void;                         // "Cuộc trò chuyện mới"
}
```

- Không gửi khi đang `waiting`/`streaming` (chặn gửi chồng).
- Ghi `sessionStorage` khi một lượt kết thúc (`done`/dừng/lỗi), **không** ghi theo từng mẩu chữ.
- Lịch sử gửi lên: 10 tin `user`/`assistant` gần nhất đã hoàn tất, cắt mỗi tin ≤ 1.000 ký tự (khớp giới hạn backend để không bị 400).
- Đóng panel khi đang stream ⇒ **vẫn** nhận nốt (người dùng mở lại thấy đủ câu). Rời trang/đóng tab ⇒ trình duyệt tự huỷ fetch, backend tự huỷ Gemini.

## Các bước thực hiện

Toàn bộ frontend là **một đợt (đợt D** trong plan backend), bắt đầu **sau** đợt C của backend (đã có API thật qua nginx). Kiểm bằng `SUPPORT_CHAT_LLM_PROVIDER=fake` để không tốn quota.

Thứ tự bên trong đợt (gộp FE-1 + FE-2 + FE-3 cũ, không cần trang tạm để thử lớp dữ liệu):

1. Lớp dữ liệu: `support-chat-stream.ts`, `support-chat-storage.ts`, `useSupportChat`, `useSupportChatSuggestions`.
2. Giao diện: launcher, panel, message, suggestions, formatter; gắn vào `provider.tsx`; danh sách ẩn; `data-role`; lắng nghe auth store và quét khi khởi động (quyết định 5).
3. Điều kiện xong: `tsc`, `npm run lint --workspace web`, `next build` sạch. **Dừng, chủ dự án kiểm trên trình duyệt** ở 375px và ≥ 1280px theo checklist dưới.

GĐ2 (tool) **không cần sửa frontend** ngoài việc câu trả lời có thể dài hơn — giao diện đã hiển thị theo luồng chữ chung.

## Checklist kiểm trên trình duyệt

- [ ] Khách ở `/`: thấy chip gợi ý, bấm chip trả lời ngay (`source=faq`), hỏi tự do thì chữ chạy dần.
- [ ] Hỏi ngoài phạm vi ("viết giúp tôi bài luận") ⇒ từ chối + link "Liên hệ hỗ trợ".
- [ ] Hỏi nối tiếp ("vậy nó giá bao nhiêu?") ⇒ trả lời đúng ngữ cảnh.
- [ ] F5 giữa hội thoại ⇒ lịch sử còn. Đóng tab mở lại ⇒ trống.
- [ ] Đăng nhập Candidate ⇒ hội thoại khách không hiện (key khác). Đăng xuất ⇒ lịch sử Candidate bị xoá (xem trong DevTools → Session Storage).
- [ ] Đăng xuất ở trang ẩn widget (vd. `/messages`) ⇒ lịch sử vẫn bị xoá.
- [ ] Sửa tay một key `sip-support-chat:candidate:{userId cũ}` trong DevTools rồi F5 khi đã đăng xuất ⇒ key bị quét đi.
- [ ] Làm hết hạn cả access lẫn refresh token rồi gửi câu hỏi ⇒ không bị chuyển trang, hiện dòng "Phiên đăng nhập đã hết hạn…", vẫn nhận câu trả lời như khách.
- [ ] Khu Employer: màu Indigo; khu Candidate/công khai: Pine.
- [ ] Không thấy widget ở `/admin*`, `/messages`, `/employer/messages`, `/cv/editor`, `/support`.
- [ ] Bấm "Dừng" giữa chừng ⇒ giữ phần chữ, có "Đã dừng"; gửi tiếp được.
- [ ] Gửi liên tục đến khi 429 ⇒ thông báo đúng, không vỡ giao diện.
- [ ] Tắt mạng khi đang hỏi ⇒ thông báo lỗi + "Thử lại".
- [ ] 375px: toàn màn hình, bàn phím ảo không che ô nhập, nút mở không đè nút "Ứng tuyển".
- [ ] Bàn phím: Tab tới nút mở, Enter mở, focus vào ô nhập, Esc đóng và focus về nút mở.
- [ ] Câu trả lời chứa `<script>` hoặc HTML (thử bằng adapter giả) ⇒ hiện nguyên văn, không chạy.

## Ngoài phạm vi

- Xem lại hội thoại cũ sau khi đóng tab, đồng bộ giữa thiết bị.
- 👍/👎, chuyển sang nhân viên hỗ trợ trong widget.
- Widget trong khu Admin.
- Gửi file/ảnh trong chat.
