# Chấm lại theo ứng viên gần thời gian thực (0.6) — Backend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-14). CHƯA TRIỂN KHAI.** Hướng đã chốt ở AD-27 trong buổi trao đổi với chủ dự án ngày 2026-11-14. Q1–Q6 đã chốt cùng ngày. **Bước 0 (đo, chỉ đọc) đã làm cùng ngày**, kết quả ở "Ghi chú triển khai". Hai câu hỏi bước 0 nêu ra cũng đã chốt cùng ngày (AD-27 mục 5 và mục 11):
> - **Q7:** model embedding chạy trong một `worker_threads`;
> - **Q8:** chấm theo lô.
>
> **Bước 1 (schema, migration) đã làm và áp lên Neon 2026-11-14. Bước 2 (đánh dấu, hẹn giờ), bước 2b (model embedding trong worker), bước 3 (chấm theo lô, ghi bảng, cron 15 phút, Q2), bước 4 (việc kéo theo: tự mời, tự chuyển, job alert lần đầu, realtime) bước 5 (danh mục đổi: chấm lại theo tin, Q1), bước 6 (tự mời đọc bảng điểm) và bước 7 (trang tìm ứng viên đọc bảng điểm) đã làm cùng ngày**. Bước 3–7 chưa kiểm đầu cuối qua gateway 8080. Việc tiếp theo: bước 8.

Mục 0.6 của `docs/01-project/FEATURE_BACKLOG.md`. Quyết định kiến trúc: AD-27 (sửa một phần AD-23, AD-24). Frontend: `docs/05-frontend/phases/live-rescore/PLAN.md`. Nền:
- AD-24 và `docs/06-backend/hiring-progress/PLAN.md` (bảng điểm, `scoreProfiles`, lượt đêm, cache hồ sơ một lượt);
- AD-23 và `docs/06-backend/auto-outreach/PLAN.md` (lượt tự mời, khoá theo công ty, cách đo tải ở bước 7);
- AD-25 (`autoReviewTrigger`), AD-26 (job alert, `job_alerts`, `upsertDaily`);
- `docs/06-backend/large-demo-data/PLAN.md` (bộ thư viện dữ liệu demo).

## Mục tiêu

Trả lời nhận xét "dữ liệu liên tục đẩy lên, em phải xử lý được": ứng viên mới hoặc vừa sửa hồ sơ thì trong khoảng **1–2 phút**:

- có điểm trong bảng điểm với mọi tin đang hiển thị;
- số "Phù hợp" của nhà tuyển dụng tăng theo;
- được tự mời nếu đạt ngưỡng của tin đang bật tự mời;
- đơn "Chờ duyệt" của họ được tự chuyển nếu đạt ngưỡng;
- ứng viên mới nhận báo các tin phù hợp.

Đồng thời tự mời và trang tìm ứng viên đọc bảng điểm (hết giới hạn 50), và có script mô phỏng dữ liệu đổ vào để demo trực tiếp.

## Các quyết định đã chốt (2026-11-14)

Tóm tắt từ AD-27; chi tiết và lý do ở AD-27.

| # | Quyết định |
|---|---|
| D1 | Dấu là cột `Candidate.matchRescoreRequestedAt` (cách A). Đặt ở mọi chỗ ghi dữ liệu bộ chấm đọc, kể cả AI trích xuất CV. |
| D2 | Chỉ xoá dấu khi dấu ≤ lúc bắt đầu chấm. |
| D3 | Hai lối: hẹn giờ chờ người dùng ngừng sửa (mặc định 45 giây, trong khoảng 30–60) và cron 15 phút. Lượt đêm giữ nguyên. |
| D4 | Chấm một ứng viên với mọi tin đang hiển thị có chung ≥ 1 kỹ năng `APPROVED`, cùng bộ chấm với bảng; thay toàn bộ dòng của ứng viên trong một transaction. |
| D5 | Chung process: một lượt mỗi lúc, **lần lượt từng lô ~50 ứng viên** (Q8), nhường event loop giữa hai lô, giới hạn 60 giây và số embedding mới mỗi lượt, cache hồ sơ tin trong bộ nhớ (TTL 1 giờ, xoá khi danh mục đổi). |
| D13 | Model embedding chạy trong **một** `worker_threads` (Q7). Sửa bên trong `SkillEmbeddingService`, chữ ký `embed` giữ nguyên; luồng chính không nạp model. |
| D6 | Admin đổi danh mục kỹ năng / ngành thì đánh dấu mọi ứng viên bị ảnh hưởng bằng SQL. |
| D7 | Sau khi chấm: kích hoạt tự mời (xoá dấu "hết ứng viên"), tự chuyển "Đang xem xét", job alert **chỉ lần đầu** có điểm, sự kiện realtime cho nhà tuyển dụng (gộp theo lượt). |
| D8 | Tự mời đọc thẳng bảng điểm, không chấm lại (sửa 2026-11-14, xem bước 6). Tin chưa chấm thì đi đường cũ. |
| D9 | Trang tìm ứng viên đọc bảng điểm; chấm trực tiếp lại 10 người hiển thị. Tin chưa chấm thì đi đường cũ. |
| D10 | Script mô phỏng đổ dữ liệu theo đợt, đi qua service, dùng lại thư viện `large-demo`. |
| D11 | Sửa trạng thái thẻ tự mời khi tỉ lệ tự động của công ty là 0%. |
| D12 | API số liệu cho thẻ "Hệ thống tự động" của Admin. |

## Câu hỏi đã chốt (2026-11-14)

- **Q1 — Danh mục đổi thì chấm lại cả theo tin (chốt: có).** Duyệt / gộp kỹ năng hay ngành không chỉ đổi hồ sơ ứng viên mà còn đổi **yêu cầu của tin** (loader tin chỉ lấy kỹ năng `APPROVED`, đọc tên ngành). Đánh dấu ứng viên (D6) chỉ chấm lại các cặp của người có kỹ năng đó; người khác trong pool của tin vẫn giữ điểm tính theo yêu cầu cũ. Vì vậy thêm bước chấm lại theo tin (lối a hiện có, **không** sinh job alert) cho các tin đang hiển thị gắn kỹ năng / ngành đó, chạy lần lượt sau lượt chấm theo ứng viên. Duyệt / gộp hiếm khi xảy ra nên tải không đáng kể.
- **Q2 — Chống lượt chấm theo tin ghi đè điểm mới (chốt: thêm cột).** Lượt đêm nạp hồ sơ một lần cho cả lượt (khoảng 5 phút), lối (a) và chấm lại của Q1 nạp trước khi ghi vài giây. Nếu trong khoảng đó ứng viên sửa hồ sơ **và** đã được chấm lại theo ứng viên (dấu đã xoá), thì lượt theo tin ghi đè bằng điểm tính từ hồ sơ cũ. Khi chạy `simulate-inflow`, tin mới đăng và ứng viên mới sửa hồ sơ diễn ra cùng lúc, nên dễ gặp đúng lúc demo. Thêm cột `Candidate.matchProfileChangedAt` (đặt cùng lúc với dấu, không bao giờ xoá). Lượt theo tin ghi xong thì đánh dấu lại những ứng viên trong pool có `matchProfileChangedAt` > lúc nạp hồ sơ. Lượt đêm vẫn giữ làm lưới an toàn: xoá dòng của tin hết hiển thị, sửa chỗ quên đánh dấu, lối (a) lỗi, đổi trọng số hay model.
- **Q3 — Job alert lần đầu (chốt: dùng lại `JOB_ALERT`).** Dùng bảng `job_alerts` của AD-26. Ghi các cặp (ứng viên, tin) đạt max(ngưỡng tin, 70), gọi `upsertDaily` ("N tin mới phù hợp với bạn"), email gộp 8h đi theo luồng sẵn có. Không thêm `NotificationType`, frontend chỉ kiểm câu chữ. "Lần đầu" = trước lượt này ứng viên không có dòng điểm nào **và** chưa từng có dòng `job_alerts` nào.
- **Q4 — Script mô phỏng gọi HTTP API qua gateway 8080 (chốt).** Hẹn giờ chờ, Socket.IO và các trigger nằm trong **process server**. Nếu script dựng container riêng thì việc chấm chạy trong process của script: sự kiện realtime không tới trình duyệt, và hẹn giờ chết khi script thoát. Script gọi API như người dùng thật: đăng ký với `OTP_HARDCODE`, đăng nhập, sửa hồ sơ; employer tạo và đăng tin; Admin duyệt nếu công ty cần duyệt. Bước 0 kiểm rate limit đăng ký / đăng nhập; vướng thì thêm một cờ chỉ bật ở dev để bỏ qua cho email `@inflow-demo.local`, không đổi hành vi production. Phần `--reset` xoá thẳng bằng Prisma theo tiền tố.
- **Q5 — Realtime cho nhà tuyển dụng (7g) (chốt).** Thêm phương thức `pushMatchUpdate(userId, { jobPostIds })` vào port `RealtimeNotifier`, event `match-scores:updated`, không ghi bảng `notifications`. Gửi cho mọi employer của công ty, đi trên kết nối Socket.IO sẵn có.
  - **Gửi tối đa một sự kiện mỗi công ty mỗi 15 giây**; các thay đổi trong khoảng đó gộp vào sự kiện sau.
  - Frontend chỉ `invalidateQueries`, nên chỉ query đang hiển thị mới tải lại.
  - Dự phòng khi mất socket: `refetchOnWindowFocus` mặc định của TanStack Query (đã bật sẵn, không thêm gì).
  - Không dùng polling định kỳ (tải theo số tab đang mở, trễ tới 30 giây). Không để nhà tuyển dụng tự tải lại trang.
- **Q6 — Tóm tắt lượt gần nhất lưu ở Redis (chốt).** Lượt chấm xong thì dấu đã bị xoá, nên "lượt gần nhất lúc nào, chấm bao nhiêu người, mất bao lâu, còn bao nhiêu" không suy được từ DB. Ghi một khoá JSON vào Redis, theo mẫu `AutoOutreachRunStore`, để còn sau khi server khởi động lại (ở dev, `tsx watch` khởi động lại mỗi lần lưu file). Dòng này cho thấy hệ thống đang làm việc khi demo, và giúp phát hiện cron chết (số đang chờ tăng mà lượt gần nhất đã lâu). Số đang chờ và dấu cũ nhất đọc thẳng từ DB. Số lời mời tự động, job alert và hồ sơ tự chuyển hôm nay đếm từ bảng sẵn có.

- **Q7 — Embedding chạy ở đâu (chốt sau bước 0: `worker_threads`, phương án b).**
  - Bước 0 mục 3: mỗi lần embed chặn luồng chính ~24 ms. Trong worker, event loop và request nhẹ như lúc rảnh, tốc độ embed không đổi. Giới hạn luồng onnxruntime và embed theo lô đều tệ hơn.
  - Làm ở bước 2b, trước bước 3 để lượt chấm và số đo ở bước 10 đã dùng worker.
- **Q8 — Giảm round trip khi chấm (chốt sau bước 0: chấm theo lô, phương án b).**
  - Mỗi lô ~50 ứng viên dùng chung câu pool ngược, nạp hồ sơ, câu hash, câu cosine, và một transaction ghi kèm xoá dấu.
  - Không bật `relationJoins`: đổi cách nạp của toàn app, để làm việc tối ưu riêng nếu cần.

## Phần 1 — Công nghệ / package / kiến trúc

- **Không thêm dependency.** Dùng lại: Prisma (`$queryRaw`, transaction), `node-cron`, awilix, `setTimeout` / `setImmediate` và `worker_threads` của Node, `ioredis` sẵn có (Q6).
- **Embedding (Q7, D13):** `SkillEmbeddingService` gửi văn bản sang một worker giữ model; file worker mới ở `apps/server/src/infrastructure/`. Port `EmbeddingProvider` và các module gọi `embed` không đổi.
- **Bộ chấm:** `CandidateOutreachService.scoreProfiles` là nguồn điểm duy nhất (AD-24 mục 4). Thêm một lối chấm **theo ứng viên** (một hồ sơ × nhiều tin) dùng cùng `JobMatcher` và cùng cách tính cosine (`MatchEmbeddingService.similarityForJobs`). Có test bảo đảm hai chiều cho cùng điểm với cùng cặp.
- **Module mới** `apps/server/src/modules/live-rescore/`:
  - `candidate-rescore-marker.ts`: đặt dấu theo ứng viên, theo kỹ năng, theo ngành; báo cho bộ hẹn giờ;
  - `live-rescore.scheduler.ts`: hẹn giờ chờ theo ứng viên (`Map<candidateId, Timeout>`), gọi lượt chấm khi hết khoảng chờ;
  - `live-rescore.service.ts`: `drain(budgetMs)`, `rescoreCandidate(candidateId, cache)`, việc kéo theo;
  - `live-rescore.repository.ts`: lấy người có dấu, xoá dấu có điều kiện, pool ngược (tin theo ứng viên), các câu cho việc kéo theo;
  - `job-profile-cache.ts`: interface `getMany` / `invalidate` / `clear`, bản cài trong bộ nhớ;
  - `live-rescore.job.ts`: cron 15 phút; `live-rescore-run-store.ts` (Q6);
  - `live-rescore.config.ts`: hằng số (khoảng chờ, giới hạn thời gian, số embedding mới, TTL và trần cache).
- **Tránh phụ thuộc vòng** như các phase trước: `candidates`, `skills`, `education-catalog` gọi dấu qua một hàm đăng ký trong awilix (`candidateRescoreMarker`), resolve lúc gọi.
- **Migration viết tay** như 0.3–0.5. **Không** dùng `--shadow-database-url` trỏ DB thật (sự cố ngày 2026-09-28).

## Phần 2 — Liên kết giữa các phần

```
Ứng viên lưu hồ sơ (CandidateService / CandidateCvImportService)
  └─ candidateRescoreMarker.mark(candidateId)
       ├─ UPDATE candidates SET matchRescoreRequestedAt = now()  (và matchProfileChangedAt nếu Q2)
       └─ scheduler.touch(candidateId) → hẹn giờ 45 s, sửa tiếp thì dời

Admin duyệt / từ chối / gộp kỹ năng, duyệt / gộp ngành (SkillsService, EducationCatalogService)
  └─ candidateRescoreMarker.markBySkill / markByMajor  → SQL đánh dấu hàng loạt
       ├─ jobProfileCache.clear()
       └─ (Q1) xếp hàng chấm lại theo tin cho các tin gắn kỹ năng / ngành đó

Hết hẹn giờ  ─┐
Cron 15 phút ─┴─► LiveRescoreService.drain(60 s)   [một lượt mỗi lúc]
                   lặp từng lô ~50 người có dấu, dấu cũ nhất trước (Q8):
                     ├─ pool ngược của cả lô (một câu): tin đang hiển thị có chung kỹ năng APPROVED
                     ├─ nạp hồ sơ cả lô (một lần loadMany)
                     ├─ jobProfileCache.getMany(jobIds)  → nạp phần thiếu
                     ├─ vector: một câu hash, embed phần cũ (worker, Q7), một câu cosine cho mọi cặp
                     ├─ chấm theo ứng viên (cùng bộ chấm với bảng)
                     ├─ một transaction: ghi điểm cả lô + xoá dấu nếu dấu ≤ lúc bắt đầu lô
                     └─ việc kéo theo:
                          ├─ tin bật tự mời vừa có người đạt ngưỡng → clearExhausted + autoOutreachTrigger(company)
                          ├─ autoReviewTrigger({ candidateId })
                          ├─ lần đầu có điểm → JobAlertService.onCandidateFirstScored (Q3)
                          └─ gom theo công ty → realtimeNotifier.pushMatchUpdate (Q5, gửi cuối lượt)

Lượt tự mời (AD-23): buildQueue đọc bảng điểm → createInvitation (lưu điểm và weightsVersion lấy từ bảng)
Trang tìm ứng viên: top 10 từ bảng → chấm lại 10 người để có lý do
GET /admin/automation-status → số người chờ, dấu cũ nhất, lượt gần nhất, số hôm nay
```

Phụ thuộc mới: `live-rescore` → `match-scores`, `candidate-outreach`, `job-matching`, `job-alerts`, `application-automation` (qua trigger), `notifications` (realtime). Chiều ngược lại chỉ qua `candidateRescoreMarker`.

## Phần 3 — Các bước thực hiện

### Bước 0 — Đo và kiểm (chỉ đọc DB, không sửa code chạy thật)

Script đo đặt ở `apps/server/scripts/` (tên `perf-live-rescore-*.ts`), không vào code chạy thật. Kết quả ghi vào "Ghi chú triển khai". Số đo bác một quyết định thì dừng và hỏi chủ dự án.

1. **Chi phí chấm lại một ứng viên** (nguyên mẫu trong script, chưa ghi bảng), với 20 ứng viên chọn ngẫu nhiên và 5 ứng viên trưng bày:
   - số tin trong pool ngược (trung vị, p90, lớn nhất);
   - thời gian từng phần: nạp hồ sơ, nạp tin, embedding, chấm, (ước) ghi;
   - **có và không có cache hồ sơ tin**;
   - số câu truy vấn và số round trip (log `$on("query")` của Prisma); thử `relationLoadStrategy: "join"` cho loader nếu round trip chiếm phần lớn.
2. **`EXPLAIN ANALYZE` câu pool ngược** (từ kỹ năng của ứng viên tìm tin). Hiện `job_post_skills` chỉ có khoá chính `(jobPostId, skillId)`, `candidate_skills` chỉ có `(candidateId, skillId)`; xem có cần index `job_post_skills("skillId")` không. Kiểm luôn các câu đánh dấu theo kỹ năng / ngành (D6).
3. **So ba cấu hình embedding** (script riêng, 200 văn bản hồ sơ thật, model nạp sẵn, mỗi cấu hình 3 lần), đo như bước 7 của plan 0.2 (`monitorEventLoopDelay`, một HTTP server nhỏ trong script nhận request mỗi 50 ms):
   - **A:** gọi model trên luồng chính (như hiện tại);
   - **B:** model trong `worker_threads`;
   - **C:** luồng chính, giới hạn số luồng onnxruntime (thử 1, 2, số lõi − 2).

   Ghi tổng thời gian, event loop p50 / p99 / max, p50 / p95 của endpoint nhẹ so với lúc rảnh. Đo thêm embed theo lô (16–32 văn bản một lần) nếu model hỗ trợ. **Đọc kết quả:** B và C cùng tốt hơn A thì nguyên nhân là tranh CPU, chọn C. Chỉ khi B tốt hơn C rõ rệt mới đề xuất `worker_threads` (AD riêng).
4. **Quy mô của D6:** với 10 kỹ năng / ngành phổ biến nhất, số ứng viên và số tin đang hiển thị bị ảnh hưởng. Dùng để ước thời gian một lượt sau khi Admin gộp (và Q1).
5. **Mốc so sánh:** thời gian trang tìm ứng viên (3 tin lớn, 3 tin nhỏ) và một lượt tự mời của công ty Mây Xanh với đường hiện tại.
6. **Cho script mô phỏng (Q4):** rate limit của đăng ký / đăng nhập / OTP; công ty demo nào tự đăng tin, công ty nào cần Admin duyệt; tài khoản employer và Admin dùng được.
7. **Ước tải job alert lần đầu (Q3):** với 20 ứng viên demo, số tin ≥ max(ngưỡng, 70) mà họ sẽ được báo nếu là người mới.

### Bước 1 — Schema và migration

- `Candidate.matchRescoreRequestedAt DateTime?` kèm index (cron chỉ đọc người có dấu). Dùng index thường thay cho index một phần `WHERE … IS NOT NULL`: Prisma 6.19 không khai báo được index một phần trong schema, tạo bằng SQL thì `migrate diff` các phase sau đòi xoá. Câu `IS NOT NULL ORDER BY … LIMIT` vẫn dùng được index thường.
- `Candidate.matchProfileChangedAt DateTime?` (Q2).
- ~~Index `job_post_skills("skillId")`~~: bước 0 mục 2 cho thấy không cần (mọi câu < 2 ms).
- Migration viết tay; kiểm `migrate diff` ra "empty migration" trước khi sửa schema; chủ dự án xác nhận trước khi áp lên Neon (`npm run db:deploy`).

### Bước 2 — Đánh dấu và hẹn giờ

- `CandidateRescoreMarker`:
  - `mark(candidateId)`: một câu `UPDATE`, rồi `scheduler.touch(candidateId)`;
  - `markBySkill(skillIds)`, `markByMajor(majorIds)`: một câu `UPDATE … WHERE id IN (SELECT …)`, rồi `jobProfileCache.clear()` và xếp lượt chấm (không hẹn giờ cho từng người);
  - lỗi khi đánh dấu chỉ ghi log, không làm hỏng request lưu hồ sơ.
- Gọi `mark` ở **mọi** lối ghi trong `CandidateService` (danh sách ở AD-27 mục 1) **sau khi** ghi thành công, và ở `CandidateCvImportService.importFromCv` sau transaction. Gọi `markBySkill` / `markByMajor` ở `SkillsService.approve` / `reject` / `merge` và `EducationCatalogService.approve` / `merge` (chỉ miền ngành).
- `LiveRescoreScheduler.touch(candidateId)`: xoá hẹn giờ cũ, đặt hẹn giờ mới `LIVE_RESCORE_DEBOUNCE_MS` (45 000). Hết giờ thì gọi `service.requestDrain()`. Trần số hẹn giờ cùng lúc (ví dụ 5.000); vượt thì bỏ hẹn giờ, chỉ để cron xử lý.
- `isOpenToOutreach` bật: không đánh dấu; xoá dấu "hết ứng viên" của các tin đang bật tự mời có chung kỹ năng với ứng viên (một câu SQL) rồi kích hoạt tự mời của các công ty đó (ghi chú "Ngoài phạm vi" của plan 0.2).
- Unit test: mỗi lối ghi có gọi `mark`; sửa liên tiếp chỉ ra một lượt; lỗi đánh dấu không làm hỏng request.

### Bước 2b — Model embedding trong một worker (Q7, D13, AD-27 mục 11)

- **Worker:** file mới ở `apps/server/src/infrastructure/` (ví dụ `embedding-worker.ts`).
  - Nạp `pipeline("feature-extraction", EMBEDDING_MODEL_ID)` **một lần**, với `cacheDir` từ `EMBEDDING_MODEL_CACHE_DIR` như `applyEmbeddingEnv`.
  - Nhận `{ id, text }`, trả `{ id, vector }` hoặc `{ id, error }`. Xử lý tuần tự.
- **`SkillEmbeddingService`:**
  - `embed` gửi việc sang worker thay vì gọi `pipeline` tại chỗ. Chữ ký `embed(text): Promise<number[] | null>` giữ nguyên.
  - Tạo worker lười ở lần gọi đầu, như model đang nạp lười. Luồng chính **không** import `@huggingface/transformers` nữa.
  - Giữ hành vi khi lỗi: nạp model lỗi thì đặt `unavailable` và trả `null` từ đó về sau. Một lần embed quá thời gian chờ (hằng số, ví dụ 10 giây) thì trả `null`. Worker chết thì các lần đang chờ trả `null` và lần gọi sau tạo worker mới.
  - Thêm `close()`. `main.ts` gọi khi server dừng, như các job đang dừng.
- **File worker cho hai cách chạy:** `tsx watch` (`.ts`) và `node dist/main.js` (`.js`). Chọn theo phần mở rộng của file đang chạy. Kiểm cả hai: `npm run dev:server` và `npm run build && npm start`.
- **Không đổi:** port `EmbeddingProvider`, `SkillEmbeddingProvider`, `MatchEmbeddingService`, `skill-dedupe.service.ts`, `catalog-suggestion-queue.job.ts`, support-chat.
- **Kiểm:**
  - Unit test cho đường lỗi: worker trả lỗi, quá thời gian chờ, worker chết.
  - Vector từ worker trùng vector cũ của cùng văn bản (so với `candidate_embeddings` đang lưu, chỉ đọc).
  - Chạy lại `perf:live-rescore-embedding --config=B` để có mốc.
  - RAM của process sau khi nạp model không tăng so với trước (~0,8 GB cho model).
- **Ước:** ~0,5 ngày.

### Bước 3 — Chấm theo ứng viên và ghi bảng

- `LiveRescoreRepository.findJobPools(candidateIds)`: một câu cho cả lô, trả `candidateId → jobPostIds` của các tin đang hiển thị (`VISIBLE_JOB`) có chung ≥ 1 kỹ năng `APPROVED` (Q8). Bước 0 đo câu cho một người ~1–1,6 ms trên Postgres.
- `JobProfileCache` (bộ nhớ): `getMany(ids)` lấy mục còn hạn, nạp phần thiếu bằng `JobMatchProfileLoader.loadMany` (một câu) và vector tin; TTL 1 giờ; trần mục (mặc định 5.000), vượt thì bỏ mục dùng lâu nhất.
- **Chấm theo lô ứng viên** (Q8): thêm vào `CandidateOutreachService` (cạnh `scoreProfiles`) một hàm nhận danh sách hồ sơ ứng viên và `JobMatchProfile` của pool từng người. Dùng cùng `JobMatcher`.
  - **Vector:** một câu `findHashes` cho các ứng viên của lô (vector tin: hash biết từ cache). Embed phần cũ qua worker (bước 2b). Một câu cosine cho mọi cặp (ứng viên, tin) của lô: thêm `MatchEmbeddingRepository.cosinesForPairs`, cùng biểu thức `1 - (c.embedding <=> j.embedding)` với `cosinesForJob` / `cosinesForCandidate`.
  - **Test bắt buộc:** với 20 cặp lấy từ bộ demo, điểm theo lô = điểm của `scoreProfiles`. Bước 0 đã thấy nguyên mẫu từng người khớp bảng 2.493 / 2.494 cặp.
- `MatchScoreRepository.replaceForCandidates(rowsByCandidate, scoredAt, batchStartedAt)`, **một** transaction cho cả lô:
  - xoá dòng của các ứng viên trong lô với các tin đang hiển thị, ghi dòng mới (`createMany` theo khúc);
  - xoá dấu có điều kiện (D2: dấu ≤ `batchStartedAt`), trừ người lỗi hoặc vượt giới hạn embedding (giữ dấu);
  - tin thôi hiển thị trong lúc chấm thì bỏ dòng của tin đó (lọc `VISIBLE_JOB` lúc ghi).
- `LiveRescoreService.drain(budgetMs)`:
  - đang có lượt thì chỉ đặt cờ "chạy thêm lượt nữa" rồi trả về (không chạy chồng);
  - lấy người có dấu, dấu cũ nhất trước, theo lô `LIVE_RESCORE_BATCH_SIZE` (50);
  - với mỗi lô: ghi lúc bắt đầu lô, nạp hồ sơ cả lô, lấy pool cả lô, chấm, ghi bảng kèm xoá dấu, gom việc kéo theo; nhường event loop giữa hai lô;
  - giới hạn số embedding mới mỗi lượt; người vượt có `semanticPending` và **giữ** dấu;
  - hết giờ thì dừng trước lô kế tiếp. Lỗi cả lô (ví dụ transaction hỏng) chỉ ghi log và giữ dấu cả lô. Hồ sơ của một người không nạp được thì bỏ người đó, giữ dấu;
  - cuối lượt ghi tóm tắt (Q6), gửi sự kiện realtime gộp (Q5).
- **Ước theo bước 0** (máy dev, round trip ~44 ms):
  - khoảng 17 round trip mỗi lô ≈ 0,8 giây, cộng 25 ms mỗi vector mới;
  - 200 ứng viên mới ≈ 10 giây, so với ~140 giây nếu chấm từng người.

  Đo lại ở bước 10.
- Cron 15 phút gọi `drain` (`startLiveRescoreJob` trong `main.ts`, mẫu `startAutoOutreachJob`).
- Q2: `MatchScoreService.rescoreJob` sau khi ghi thì đánh dấu lại những người trong pool có `matchProfileChangedAt` > lúc nạp hồ sơ.

### Bước 4 — Việc kéo theo

- **Tự mời:** từ các dòng vừa ghi, lấy tin bật tự mời, đang hiển thị, điểm ≥ `autoOutreachMinScore`, ứng viên còn mời được (cùng điều kiện với `searchCandidatePool`). Xoá dấu "hết ứng viên" của các tin đó, gom theo công ty, cuối lượt gọi `autoOutreachTrigger` một lần cho mỗi công ty.
- **Tự chuyển "Đang xem xét":** mở rộng `AutoReviewTrigger` nhận `{ candidateId }`; câu chọn hiện có lọc thêm theo ứng viên.
- **Job alert lần đầu (Q3):** `JobAlertService.onCandidateFirstScored(candidateId)` dùng chung luật lọc của `onJobScored` (ngưỡng, công tắc, thành phố, loại đơn / lời mời), ghi `job_alerts`, gọi `upsertDaily`. Chạy trong hàng đợi tuần tự sẵn có của `JobAlertService`.
- **Realtime (Q5):** gom `companyId → jobPostIds` của các tin có người **vừa vượt** ngưỡng (trước dưới hoặc chưa có dòng, nay ≥ ngưỡng); cuối lượt gửi `match-scores:updated` cho employer của từng công ty, tối đa một sự kiện mỗi công ty mỗi 15 giây (`LIVE_RESCORE_PUSH_THROTTLE_MS`; phần dồn lại gửi ở lần sau).
- Unit test cho từng việc, gồm trường hợp ứng viên tắt cho liên hệ, đã nộp đơn, đã nhận đủ 10 lời mời trong ngày.

### Bước 5 — Danh mục đổi (D6, Q1)

- Đánh dấu hàng loạt như bước 2. Q1 theo đề xuất: xếp các tin đang hiển thị gắn kỹ năng / ngành đó vào một hàng chờ chấm lại theo tin, chạy lần lượt bằng `MatchScoreService.rescoreJob` (không gọi `jobScoredListener`, nên không sinh job alert), sau lượt theo ứng viên.
- Kiểm: gộp kỹ năng trên dữ liệu kiểm (branch Neon đo hiệu năng, `PERF_DATABASE_URL`), đo thời gian đến khi hết dấu.

### Bước 6 — Tự mời đọc bảng điểm (D8)

- `AutoOutreachService.buildQueue`: nếu tin đã có `matchScoresAt` thì đọc từ bảng những người điểm ≥ `minScore`, bật cho liên hệ, chưa nộp đơn, không có lời mời chặn, chưa đủ trần hôm nay; điểm giảm dần (bằng nhau thì nhiều kỹ năng chung hơn trước, như thứ tự cũ); lấy tối đa (số lượt còn lại × 2) người. **Không chấm lại:** lời mời chỉ lưu `matchScore` và `matchWeightsVersion` (`createInvitation`), cả hai có sẵn trong bảng. Tin chưa chấm thì giữ đường cũ.
- *Sửa 2026-11-14 (chủ dự án hỏi lại):* bản đầu của plan chấm trực tiếp lại người sắp mời "để có `MatchResult` lưu kèm lời mời". Lý do đó sai: lời mời không lưu lý do chấm. Độ mới của điểm đã do 0.6 bảo đảm (chấm lại vài phút sau khi sửa hồ sơ, Q2 chống ghi đè), nên chấm lại chỉ tốn thêm thời gian và embedding.
- `createInvitation` hiện nhận `match?: MatchResult | null` và tự chấm khi `match` là `undefined`. Thu hẹp kiểu đầu vào về `{ score, weightsVersion } | null` (chỉ hai trường được dùng), để lượt tự mời truyền điểm từ bảng mà không phải dựng `MatchResult` giả. Mời tay và "Mời tất cả" truyền phần tương ứng của `MatchResult` đang có, hành vi không đổi.
- Dòng `semanticPending = true` (điểm rule-only vì chưa có embedding) vẫn được mời như dòng thường, cùng cách số "Phù hợp" của AD-24 đang đếm; người đó vẫn giữ dấu nên được chấm đầy đủ ở lượt sau.
- `hasCappedSkillMatch` / `markExhausted` giữ nguyên ý nghĩa. Bỏ `AUTO_OUTREACH_PREFILTER_LIMIT` nếu không còn chỗ dùng.
- Đo lại một lượt cron của Mây Xanh so với mốc ở bước 0 mục 5.

### Bước 7 — Trang tìm ứng viên đọc bảng điểm (D9)

- `CandidateOutreachService.searchCandidates`: tin đã chấm thì lấy top 10 người còn mời được theo điểm lưu (cùng điều kiện như bước 6, không lọc trần ngày, vì trang vẫn hiện người đã đủ trần kèm nút mờ như hiện tại), chấm lại 10 người đó để có lý do, sắp theo điểm vừa chấm. Tin chưa chấm thì giữ đường cũ.
- Giữ nguyên dạng response; "N người điểm cao nhất trong M người phù hợp" lấy M từ bảng như hiện tại.
- Kiểm: top 10 khớp bảng; thời gian so với mốc.

### Bước 8 — Thẻ tự mời khi tỉ lệ 0% (D11) và số liệu cho Admin (D12)

- `resolveAutoOutreachState` nhận thêm `autoSharePercent`; bằng 0 thì trả trạng thái mới (ví dụ `PAUSED_BY_COMPANY_SHARE`); cập nhật type ở `packages/shared-types`.
- `GET /admin/automation-status` (chỉ Admin): `{ rescore: { pending, oldestRequestedAt, lastRun: { at, candidates, durationMs, remaining } | null }, today: { autoInvitations, jobAlerts, autoReviewed }, nightly: { lastRunAt } | null }`. "Hôm nay" theo giờ Việt Nam, đếm từ `candidate_outreach_invitations` (`source = AUTO`), `job_alerts`, `application_status_history` (`actorId = null`, sang `REVIEWING`).
- Shared-types: DTO trạng thái, payload `match-scores:updated`.

### Bước 9 — Script mô phỏng `simulate-inflow` (D10, Q4)

```
npm run simulate-inflow --workspace server -- --candidates 50 --jobs 5
npm run simulate-inflow --workspace server -- --waves 5 --every 60 --candidates 20 --jobs 2
npm run simulate-inflow --workspace server -- --dry-run          # in sẽ tạo gì, không gọi API
npm run simulate-inflow --workspace server -- --reset            # xoá mọi thứ script đã tạo
```

- Theo Q4: gọi HTTP API qua gateway (`SIMULATE_BASE_URL`, mặc định `http://localhost:8080`). Ứng viên đăng ký bằng OTP cố định của dev, bật cho liên hệ, thêm kỹ năng / học vấn / kinh nghiệm / dự án lấy từ `personas.json` và `positions.json`. Tin lấy từ `job-templates.json`, đăng dưới tài khoản employer của công ty demo, Admin duyệt nếu cần.
- Email `ung-vien-inflow-NNNN@inflow-demo.local`; id do server sinh. `--reset` xoá theo miền email (user, candidate và mọi bảng gắn với họ) và tin có tiêu đề hoặc mã đánh dấu riêng (chốt ở bước 0 mục 6).
- Dừng ngay nếu `NODE_ENV=production` hoặc gateway không trả `/api/health`. Không gửi email thật (`OTP_HARDCODE`, miền `.local` bị chặn).
- In sau mỗi đợt: số người / tin đã tạo, rồi đọc `GET /admin/automation-status` để in số người đang chờ chấm.

### Bước 10 — Kiểm thử

1. **Unit test:** xoá dấu có điều kiện (D2), hẹn giờ dời khi sửa tiếp, điểm theo ứng viên = điểm theo tin, việc kéo theo, job alert chỉ lần đầu, trạng thái thẻ khi tỉ lệ 0%.
2. **Đầu cuối qua gateway 8080** với tài khoản demo (Mây Xanh):
   - ứng viên mới thêm kỹ năng → có dòng điểm trong ≤ 2 phút; số "Phù hợp" của tin liên quan tăng; được tự mời nếu tin bật tự mời và còn hạn mức;
   - ứng viên nộp đơn rồi sửa hồ sơ cho đạt ngưỡng → đơn tự chuyển "Đang xem xét";
   - ứng viên mới nhận một thông báo "N tin mới phù hợp"; sửa hồ sơ tiếp không nhận thêm;
   - Admin gộp hai kỹ năng (trên dữ liệu kiểm) → hết dấu trong thời gian ước ở bước 0 mục 4.
3. **Đo tải bằng script mô phỏng:** 200 ứng viên trong một đợt. Đo event loop p99, `/api/health`, `/job-posts` và `GET /employer/dashboard/hiring-progress` (bị gọi lại theo sự kiện realtime) p50 / p95 so với lúc rảnh, thời gian đến khi hết dấu. Ngưỡng giữ chung process: event loop p99 < 100 ms và API nhẹ chậm không quá 2 lần (cùng ngưỡng plan 0.2), hoặc chậm quá 2 lần nhưng không quá vài giây mỗi đợt. Đo khi đã có worker embedding (bước 2b); vượt ngưỡng thì dừng và hỏi chủ dự án.
4. **Lượt đêm vẫn đạt:** chạy `rescore-match-scores` sau khi có dữ liệu mô phỏng, thời gian và độ trễ web như mốc của AD-24.

### Bước 11 — Tài liệu

- `FEATURE_BACKLOG.md` dòng 0.6, trạng thái AD-27, "Ghi chú triển khai" của plan này.
- Ghi chú ở `docs/06-backend/job-discovery/PLAN.md` (điểm `/jobs` không còn "cập nhật hằng đêm") và `docs/06-backend/application-automation/PLAN.md` (ứng viên mới không còn chờ lượt đêm).

## Ngoài phạm vi

- Tách worker / dịch vụ embedding riêng / hàng đợi BullMQ: chỉ làm theo số đo, với AD riêng (AD-27 "Hướng mở rộng").
- Cache hai tầng (bộ nhớ + Redis): khi chạy nhiều instance.
- Read replica của Neon.
- "Xem thêm" ở trang tìm ứng viên (frontend 7f) và trạng thái "Đang cập nhật việc làm phù hợp…" ở trang hồ sơ (7e): chủ dự án để sau.
- Job alert khi sửa hồ sơ (chỉ lần đầu, AD-27 mục 6).

## Ước lượng

| Phần | Ước |
|---|---|
| Bước 0 (đo, gồm so cấu hình embedding) | ~0,5 ngày |
| Bước 1–5 (dấu, hẹn giờ, chấm theo lô, việc kéo theo, danh mục) | ~1–1,5 ngày |
| Bước 2b (embedding trong worker, Q7) | ~0,5 ngày |
| Bước 6–8 (tự mời và tìm ứng viên đọc bảng, thẻ 0%, API Admin) | ~0,5–1 ngày |
| Bước 9–11 (script mô phỏng, kiểm thử, tài liệu) | ~1 ngày |
| **Tổng backend** | **~3,5–4,5 ngày** |

Ước ban đầu ở backlog (1–1,5 ngày) chưa gồm: chuyển trang tìm ứng viên sang đọc bảng, cache hồ sơ tin, so cấu hình embedding, realtime và thẻ Admin.

## Ghi chú triển khai

### Bước 0 — kết quả đo (2026-11-14)

Script: `apps/server/scripts/perf-live-rescore-measure.ts` (mục 1, 2, 4–7) và `perf-live-rescore-embedding.ts` (mục 3), chạy bằng `npm run perf:live-rescore-measure` / `perf:live-rescore-embedding`.
- Chỉ đọc DB đang dùng (Neon, 1.524 ứng viên, 314 tin đang hiển thị, 132.863 dòng điểm). Vector tính ra không được lưu.
- Máy đo: 12 luồng CPU logic, không chạy server.

**Mục 1 — chấm lại một ứng viên** (20 ứng viên ngẫu nhiên + 5 ứng viên trưng bày, nguyên mẫu, chưa ghi bảng):

| | p50 | p90 | max |
|---|---|---|---|
| Round trip tới Neon (`SELECT 1`) | 44 ms | 46 ms | 46 ms |
| Pool ngược (số tin) | 103 | 153 | 158 |
| Câu pool ngược (1 câu) | 47 ms | 48 ms | 98 ms |
| Nạp hồ sơ ứng viên (7 câu) | 319 ms | 367 ms | 682 ms |
| Nạp hồ sơ tin của pool (5 câu) | 470 ms | 533 ms | 570 ms |
| Embedding + cosine (3 câu, 0 vector mới) | 229 ms | 232 ms | 301 ms |
| Chấm trong bộ nhớ | 1,1 ms | 2,8 ms | 17 ms |
| **Tổng, không cache tin** (16 câu) | **1.073 ms** | 1.165 ms | 1.667 ms |
| **Tổng, có cache tin** (11 câu) | **505 ms** | 509 ms | 580 ms |

- Ghi (`replaceForCandidate`), ước tính: transaction có 4 round trip, khoảng 180 ms.
- **Gần như toàn bộ thời gian là round trip tới Neon.** Phần chấm dưới 3 ms.
- **Thử `relationLoadStrategy: "join"`** (client tạm sinh từ bản sao schema có preview `relationJoins`, đã xoá sau khi đo):
  - hồ sơ ứng viên: 7 câu / 319 ms → 1 câu / 47 ms;
  - hồ sơ tin: 5 câu / 466 ms → 1 câu / 108 ms.
- **Điểm theo ứng viên so với điểm trong bảng:** 2.493 / 2.494 cặp khớp. Cặp lệch 1 điểm, có lẽ do hồ sơ sửa sau lượt chấm. Kết quả này ủng hộ test bắt buộc ở bước 3.

**Mục 2 — `EXPLAIN ANALYZE`.** Mọi câu đều dưới 2 ms:
- pool ngược: 1–1,6 ms, có Seq Scan `job_post_skills` (2.209 dòng);
- chọn ứng viên theo kỹ năng / ngành (D6): 0,3–0,7 ms;
- chọn tin theo kỹ năng / ngành (Q1): 0,4–0,5 ms.

**Không cần index `job_post_skills("skillId")`** ở quy mô này. Bước 1 bỏ mục index đó; xem lại khi `job_post_skills` lớn gấp chục lần.

**Mục 3 — so cấu hình embedding.** 200 văn bản hồ sơ thật, trung vị của 3 lần. Đo HTTP bằng request mỗi 50 ms tới server trong cùng process.

| Cấu hình | Tổng | ms / văn bản | Event loop p50 / p99 / max | HTTP p50 / p95 / max |
|---|---|---|---|---|
| Lúc rảnh | — | — | ~10 / 16 / — (độ phân giải đồng hồ Windows) | 1,1 / 1,8 / — |
| **A** luồng chính (như hiện tại) | 4,8 s | 24 | 26 / 44 / 65 | 14 / 31 / 55 |
| A, lô 16 văn bản | 7,4 s | 37 | 616 / 699 / 723 | 2.356 / 4.233 / 4.427 |
| A, lô 32 văn bản | 8,0 s | 40 | 1.287 / 1.414 / 1.512 | 3.349 / 6.203 / 6.591 |
| **B** `worker_threads` | 4,5 s | 23 | 16 / 22 / 25 | **0,8 / 1,1 / 1,7** |
| C, 1 luồng onnxruntime | 11,7 s | 59 | 64 / 99 / 105 | 28 / 69 / 96 |
| C, 2 luồng | 7,0 s | 35 | 38 / 57 / 62 | 19 / 41 / 57 |
| C, 10 luồng | 4,2 s | 21 | 23 / 36 / 58 | 11 / 23 / 54 |

**Đọc kết quả:**
- Mỗi lần embed **chặn luồng chính** trong suốt thời gian suy luận (~24 ms). Event loop p50 của A xấp xỉ thời gian một văn bản; embed theo lô chặn cả lô.
- Nguyên nhân không phải tranh CPU. Giới hạn luồng (C) làm mỗi lần chặn **dài hơn**, nên tệ hơn A. Embed theo lô vừa chậm hơn vừa chặn lâu: loại.
- B giữ event loop như lúc rảnh, cùng tốc độ với A. Theo cách đọc đã ghi ở mục 3 (B tốt hơn C rõ rệt), đây là trường hợp **đề xuất `worker_threads`** (cần AD riêng, xem câu hỏi Q7 bên dưới).
- A vẫn **đạt ngưỡng của bước 10**: event loop p99 44 ms < 100 ms. API nhẹ chậm hơn 2 lần nhưng chỉ thêm 15–30 ms, trong khoảng 25 ms × số vector mới (200 ứng viên mới ≈ 5 giây). Vì vậy D5 (chung process) không bị bác.

**Mục 4 — quy mô khi đổi danh mục (D6, Q1).** Mười kỹ năng phổ biến nhất ảnh hưởng 124–452 ứng viên và 25–96 tin. Nặng nhất là "Excel": 452 người, 96 tin. Mười ngành phổ biến nhất ảnh hưởng 37–133 người và 4–43 tin.

Ước thời gian nếu gộp "Excel":
- **Theo ứng viên:** 452 × ~0,7 s (có cache, gồm ghi) ≈ 5 phút, tức khoảng 5 lượt 60 giây. Nếu chấm theo lô (Q8): dưới nửa phút.
- **Theo tin (Q1):** 96 tin × ~0,5 s (lượt đêm hiện chấm 314 tin trong ~2–3 phút) ≈ 50 giây.

**Mục 5 — mốc so sánh với đường hiện tại:**
- **Trang tìm ứng viên:**
  - Đường hiện tại: 1.098–1.652 ms (23 câu), gồm 3 tin pool 882 và 3 tin pool 22–91.
  - Đọc bảng rồi chấm lại 10 người: 966–1.349 ms (22–25 câu).
  - Riêng câu đọc bảng: 0,2–0,3 ms, dùng index `(jobPostId, score)`.
- **Lượt tự mời Mây Xanh.** Công ty hiện **không có tin nào bật tự mời**, nên đo giả định coi cả 34 tin đang hiển thị đều bật:
  - phần tìm và chấm của đường hiện tại: **~27 giây** (537 câu), vượt giới hạn 60 giây của lượt nếu có thêm vài công ty;
  - đọc bảng (tối đa 20 người mỗi tin): **~1,7 giây** (35 câu).
  - Kết quả này ủng hộ D8.
  - Để demo, cần bật tự mời cho vài tin của Mây Xanh trước.

**Mục 6 — cho `simulate-inflow` (Q4):**
- **Rate limit và hạn mức:**
  - OTP: 1 lần / 60 giây / email, 20 / giờ / email, **1.000 / giờ / IP**. Mỗi email chỉ cần 1 OTP, nên 200 ứng viên một đợt không vướng. **Không cần cờ dev bỏ rate limit.**
  - Đăng nhập chỉ đếm khi sai mật khẩu. Nginx không có `limit_req`.
  - Hạn mức thêm mục danh mục mới: 150 / tuần toàn hệ thống. Script **chỉ dùng kỹ năng / ngành đã `APPROVED`** (hiện có 184 kỹ năng).
- **Công ty demo:** Mây Xanh, Chính Trực, Hạt Giống, Con Thoi.
  - Cả bốn đã xác minh, `requiresApproval = false` (tin tự đăng, không cần Admin duyệt), gói `ACTIVE` đến 2027-02-07 (không vướng hạn mức đăng tin).
  - Tài khoản nhà tuyển dụng: `tuyendung-<tên>@large-demo.local`, đều `ACTIVE`.
  - Có 1 Admin đang hoạt động. Chưa có tài khoản `@inflow-demo.local` nào.
- **Đánh dấu tin do script tạo để `--reset`:** chốt khi làm bước 9 (tiền tố trong tiêu đề hoặc danh sách id ghi ra file).

**Mục 7 — job alert lần đầu (Q3).** Số tin một ứng viên sẽ được báo nếu là người mới (điểm ≥ max(ngưỡng, 70), chưa nộp đơn / nhận lời mời):
- 25 ứng viên mẫu: p50 2, p90 11, max 20 (cài đặt báo tin hiện tại không làm đổi số);
- mọi ứng viên: p50 3, p90 11, max 43.

Mỗi người chỉ nhận một thông báo gộp ("N tin…"), nên tải là 1 câu ghi `job_alerts` cộng 1 `upsertDaily` mỗi ứng viên mới. Không đáng kể.

### Bước 1 — Schema và migration (2026-11-14)

- Trước khi sửa: `prisma migrate status` báo Neon đã áp đủ 37 migration; `migrate diff --from-schema-datasource --to-schema-datamodel` (chỉ đọc cấu trúc Neon, không dùng shadow DB) ra "empty migration".
- Schema: `Candidate.matchRescoreRequestedAt DateTime?`, `Candidate.matchProfileChangedAt DateTime?`, `@@index([matchRescoreRequestedAt])`. Thêm thành khối riêng, không chạy `prisma format` (lệnh này căn lề lại ~50 dòng không liên quan).
- Migration `20261114120000_add_live_rescore`: SQL sinh bằng `migrate diff` như trên. Gồm 1 câu `ALTER TABLE candidates ADD COLUMN` × 2 (cho phép null) và 1 `CREATE INDEX`. Không ghi dữ liệu; ứng viên cũ có dấu null (bảng điểm hiện có đã đúng nhờ lượt đêm).
- `prisma generate` và `tsc --noEmit` của `apps/server` qua.
- Chủ dự án áp bằng `npm run db:deploy` ngày 2026-11-14. Kiểm sau khi áp: `prisma migrate status` báo đủ 38 migration, `migrate diff` ra "empty migration"; 1.524 ứng viên đều có hai cột null, index `candidates_matchRescoreRequestedAt_idx` có trên Neon.

### Bước 2 — Đánh dấu và hẹn giờ (2026-11-14)

Module mới `apps/server/src/modules/live-rescore/`:
- `live-rescore.config.ts`: `LIVE_RESCORE_DEBOUNCE_MS` 45 000, `LIVE_RESCORE_MAX_TIMERS` 5 000.
- `live-rescore.repository.ts`: `markCandidates(ids)` (đặt dấu và `matchProfileChangedAt` bằng `NOW_UTC` của DB, ghi bằng SQL nên không đổi `updatedAt`), `findCandidateIdsBySkills`, `findCandidateIdsByMajors`.
- `live-rescore.scheduler.ts`: `LiveRescoreScheduler.touch` (một hẹn giờ mỗi ứng viên, sửa tiếp thì dời, hẹn giờ `unref()`; quá trần thì bỏ hẹn giờ, cảnh báo một lần, chờ cron), `clear()`.
- `candidate-rescore-marker.ts`: `mark(candidateId)`, `markSkillHolders(skillIds, change)`, `markMajorHolders(majorIds, change)`. Không hàm nào ném lỗi vì đánh dấu; lỗi của `change` được ném lại nguyên vẹn.
- `live-rescore.module.ts`: `registerLiveRescore`, gọi trong `main.ts` **trước** mọi router. Marker chỉ phụ thuộc prisma, logger, scheduler nên các service nhận thẳng `candidateRescoreMarker`, không cần hàm resolve lười. Chiều marker → lượt chấm đi qua `liveRescoreDrainRequester`. Bước 2 đặt bản tạm chỉ ghi log; bước 3 thay bằng `liveRescoreService.requestDrain()`.

Nơi gọi:
- `CandidateService`: thêm / sửa / xoá học vấn (kể cả đặt học vấn hiện tại), kỹ năng, kinh nghiệm, dự án; `updateProfile` **chỉ khi** gửi `headline` hoặc `bio` (SĐT, thành phố, ảnh, ngày sinh không vào bộ chấm). Gọi sau khi ghi, có `await` (thêm một round trip mỗi lần lưu), response không đổi.
- `CandidateCvImportService.importFromCv`: sau transaction.
- `SkillsService.approve` / `reject` / `merge`; `EducationCatalogService.renameApprove` / `reject` / `merge` (chỉ miền ngành).
- **Thêm so với plan:** cron gộp tự động mục PENDING bằng LLM (`catalog-suggestion-queue.job.ts`, kỹ năng và ngành) và Admin từ chối / sửa tên ngành, vì các lối này cũng đổi liên kết hoặc tên mà bộ chấm đọc. **Bớt so với plan:** duyệt ngành không đánh dấu (bộ chấm không đọc trạng thái ngành); trường học không đánh dấu (bộ chấm không đọc trường).
- **Khác plan ở cách đánh dấu theo danh mục:** không dùng một câu `UPDATE … WHERE id IN (SELECT …)` sau khi đổi, vì từ chối xoá liên kết (cascade) và gộp chuyển liên kết sang mục đích, nên sau khi đổi không còn tìm được đúng người. Marker lấy danh sách người **trước**, chạy thao tác, rồi `UPDATE … WHERE id IN (danh sách)`. Không hẹn giờ cho từng người, chỉ yêu cầu một lượt chấm.
- **Để lại cho bước sau:** `jobProfileCache.clear()` khi danh mục đổi (cache làm ở bước 3) và hàng chờ chấm lại theo tin (Q1, bước 5).
- **Bật cho liên hệ** (`CandidateOutreachService.updateSettings` khi giá trị mới là `true`): `AutoOutreachRepository.clearExhaustedForCandidate` xoá dấu "hết ứng viên" của các tin đang chạy tự mời (điều kiện như `findRunnableJobs`) có chung ≥ 1 kỹ năng `APPROVED`, bằng một câu `UPDATE … RETURNING`, rồi gọi `autoOutreachTrigger` cho từng công ty có tin vừa được xoá dấu. Tin chưa có dấu không cần đụng, vì cron 15 phút vẫn xét như thường. Lỗi chỉ ghi log, cài đặt vẫn lưu.

Kiểm:
- `tests/unit/live-rescore-marker.test.ts`, 19 test:
  - hẹn giờ: sửa liên tiếp ra một lượt, trần, lỗi khi yêu cầu chấm, `clear`;
  - marker: lỗi không lan ra, thứ tự lấy người → đổi → đánh dấu, thao tác lỗi thì không đánh dấu;
  - 12 lối ghi của `CandidateService`, các lối không đánh dấu;
  - danh mục kỹ năng / ngành / trường, cron gộp LLM;
  - bật / tắt cho liên hệ.
- Toàn bộ unit test của server: 584 / 584 qua. `tsc --noEmit` qua.
- Câu SQL mới kiểm trên Neon: hai câu tìm người chạy thật (chỉ đọc). Câu `markCandidates` và `clearExhaustedForCandidate` kiểm bằng `EXPLAIN` (không chạy). Sau khi kiểm, Neon vẫn có 0 dấu.
- Chưa kiểm đầu cuối qua gateway 8080: chủ dự án sửa hồ sơ một ứng viên rồi xem `matchRescoreRequestedAt` được đặt và log "hết khoảng chờ" sau ~45 giây.

### Bước 2b — Model embedding trong một worker (2026-11-14)

**File:**
- `src/infrastructure/embedding-worker.ts` (mới): file chạy trong worker. Nạp `pipeline("feature-extraction", modelId)` một lần, đặt `env.cacheDir` trên chính module vừa `import()`. Nhận `{ id, text }`, trả `{ type: "result", id, vector }` hoặc `{ …, error }`; báo `ready` hoặc `load-error` sau khi nạp.
- `src/infrastructure/embedding-worker-client.ts` (mới): `EmbeddingWorkerClient` giữ worker, hàng đợi và thời gian chờ; `createEmbeddingWorker` chọn `embedding-worker.ts` hoặc `.js` theo phần mở rộng của chính file client. Tách khỏi service để test bằng worker giả (awilix không cho thêm tham số tuỳ chọn vào constructor của service).
- `SkillEmbeddingService`: `embed` gọi client, thêm `close()`. Bỏ `getExtractor` và cờ `unavailable` (chuyển vào client). Chữ ký `embed` giữ nguyên; các script dựng `new SkillEmbeddingService({ prisma, logger })` không đổi.
- `shared/ai/embedding-env.ts`: `applyEmbeddingEnv(env)` thành `resolveEmbeddingCacheDir()`, vẫn ghi log như trước, trả thư mục để truyền cho worker.

**Khác so với plan:**
- **Không sửa `main.ts`.** Plan ghi "gọi `close()` khi server dừng, như các job đang dừng", nhưng `main.ts` không có xử lý dừng nào. Thêm bắt `SIGINT` / `SIGTERM` sẽ đổi cách server tắt, ngoài phạm vi. Worker thread chết cùng process, kể cả khi `tsx watch` khởi động lại, nên không có worker thừa. Worker chỉ `ref()` khi đang có việc, nên không giữ process sống.
- **Thời gian chờ đo một lần embed:** client gửi từng việc một, chờ kết quả rồi gửi việc sau. Không tính lúc nạp model (lần đầu có thể phải tải model) hay lúc xếp hàng (lô 200 văn bản ở bước 3 mất ~5 giây). Quá giờ thì việc đang chạy và việc đang xếp hàng trả `null`, worker bị dừng, lần gọi sau tạo worker mới.
- **Worker chết trước khi nạp xong** (vd. không import được gói) coi như nạp model hỏng: `unavailable`, không tạo lại. Chết sau khi đã nạp thì tạo lại ở lần gọi sau.
- **RAM tăng nhẹ:** cùng một script đo, model trên luồng chính 931 MB sau khi nạp và 1.356 MB sau 80 lần embed; trong worker 961 MB và 1.412 MB. Worker tốn thêm khoảng 30–55 MB (isolate V8 riêng). Plan ghi "không tăng"; mức này nhỏ so với ~0,9 GB của model.

**Kiểm:**
- `tests/unit/embedding-worker-client.test.ts`, 10 test với worker giả: trả vector; gửi tuần tự đúng thứ tự; worker trả lỗi một việc; nạp model hỏng; worker chết trước khi nạp xong; quá giờ (kể cả kết quả muộn của worker cũ bị bỏ qua); thời gian chờ không tính lúc nạp; worker chết sau khi nạp; `close()`; tạo worker ném lỗi.
- Toàn bộ unit test của server: 594 / 594 qua. `tsc --noEmit` qua.
- Model thật, script tạm (đã xoá), chỉ đọc Neon:
  - `tsx` (file `.ts`): 20 ứng viên có hash khớp, cosine giữa vector từ worker và vector đang lưu trong `candidate_embeddings` nhỏ nhất 1,000000; 10 kỹ năng (`skills.embedding`) cũng 1,000000. Luồng chính không nạp module `@huggingface` nào (bản cũ nạp 36). Process tự thoát khi không gọi `close()`.
  - Bản build (`tsc` ra thư mục tạm, chạy bằng `node`, file `.js`): 5 kỹ năng, cosine 1,000000.
  - Event loop khi chấm 20 ứng viên kèm round trip Neon: p99 16 ms (bản cũ 40 ms).
- `perf:live-rescore-embedding --config=B`: 24,7 ms / văn bản, event loop p99 22,7 ms, HTTP p95 1,1 ms (lúc rảnh 1,5 ms), khớp bước 0.
- Chưa kiểm qua `npm run dev:server` và `npm run build && npm start` của chủ dự án: thêm một kỹ năng mới (gõ tên chưa có) hoặc mở "Việc làm phù hợp" để server nạp model, log phải có "Loading embedding model …" và không có "Embedding model unavailable".

### Bước 3 — Chấm theo ứng viên và ghi bảng (2026-11-14)

**File mới trong `src/modules/live-rescore/`:**
- `live-rescore.service.ts` (`LiveRescoreService`):
  - `drain(trigger)`: một lượt mỗi lúc. Lặp từng lô 50 người có dấu, dấu cũ nhất trước: nạp hồ sơ → pool ngược → hồ sơ tin (cache) → chấm → một transaction ghi điểm và xoá dấu. Nhường event loop giữa hai lô.
  - `requestDrain()`: thay bản tạm ghi log của bước 2 trong `liveRescoreDrainRequester`.
- `job-profile-cache.ts`: interface `JobProfileCache` và bản `InMemoryJobProfileCache` (TTL 1 giờ, trần 5.000 mục, bỏ mục dùng lâu nhất).
- `live-rescore.job.ts`: cron 15 phút gọi `drain("cron")`. `main.ts` khởi động cron cạnh các job khác.
- `live-rescore-run-store.ts` (Q6): khoá Redis `live-rescore:last-run`, giữ 7 ngày, lưu JSON tóm tắt lượt gần nhất (thời điểm, thời gian, số lô, số người, số dòng, số dấu đã xoá, số người giữ dấu, số vector mới, có hết giờ không, số còn dấu).
- `live-rescore.config.ts` thêm: giới hạn lượt 60 giây, lô 50 người, 300 vector mới mỗi lượt, nghỉ 1 giây trước khi chạy tiếp, TTL và trần của cache.
- `live-rescore.repository.ts` thêm:
  - `findMarkedBatch(limit, exclude)`: lấy người có dấu kèm giờ của DB (`NOW_UTC`);
  - `findJobPools(candidateIds)`: pool ngược cả lô trong một câu;
  - `countMarked()`.

**Sửa ở module khác:**
- `MatchEmbeddingRepository.cosinesForPairs(pairs)`: một câu cho mọi cặp, hai mảng song song qua `unnest`, cùng biểu thức `1 - (c <=> j)`.
- `MatchEmbeddingService.similarityForPairs`: một câu hash mỗi loại, embed phần cũ trong giới hạn chung (tin trước), trả `deferredCandidates` (người vượt giới hạn, không phải người lỗi model). `ensureVectors` giờ trả thêm `deferred` và `embedded`; ba hàm cũ chỉ đọc `.ready`, hành vi không đổi.
- `CandidateOutreachService.scoreCandidatesAgainstJobs(entries, maxNewEmbeddings)`: đặt cạnh `scoreProfiles`, dùng chung hàm `score()` riêng.
- `MatchScoreRepository`:
  - `replaceForCandidates`: một transaction gồm xoá dòng của các ứng viên trong lô với tin đang hiển thị, lọc lại tin đang hiển thị, `createMany` theo khúc 1.000 với `skipDuplicates`, xoá dấu khi dấu ≤ lúc bắt đầu lô;
  - `markChangedSince` (Q2);
  - kiểu `CandidateScoreRow`.
- `MatchScoreService.rescoreJob` (Q2): ghi xong thì gọi `markChangedSince(pool, lúc cache nạp hồ sơ đầu tiên − 5 giây)`. Có người được đánh dấu lại thì gọi `liveRescoreDrainRequester` (nhận qua awilix, không bắt buộc). Lỗi chỉ ghi log. `CandidateProfileCache` thêm `firstLoadAt`.
- `CandidateRescoreMarker.markSkillHolders` / `markMajorHolders`: sau khi thao tác thành công thì `jobProfileCache.clear()`, kể cả khi không ứng viên nào có mục đó (yêu cầu của tin vẫn đổi).
- Awilix: `jobProfileCache` và `liveRescoreService` đăng ký bằng `asFunction`, giống hẹn giờ. Constructor có tham số tuỳ chọn cho test, mà awilix báo lỗi khi đọc một tên chưa đăng ký.

**Khác so với plan:**
- **Hash vector tin không lấy từ cache.** Mỗi lô có thêm một câu `findHashes` cho tin, vì vector tin có thể được tính lại ở lối khác (lối a, "Việc làm phù hợp"). Thêm khoảng 44 ms mỗi lô.
- **Không kiểm `updatedAt` của tin trong cache.** Tin đã gửi duyệt / đang hiển thị không sửa được (`updateDraft` chỉ cho DRAFT), nên hồ sơ tin chỉ đổi khi danh mục đổi; lúc đó marker xoá cache.
- **Xoá dấu trong lượt:** người giữ dấu (lô lỗi, vượt giới hạn embedding) bị loại khỏi các lô sau của cùng lượt, để lượt không chọn lại họ mãi.
- **Chạy tiếp:**
  - lượt dừng vì hết 60 giây mà còn dấu thì tự chạy lượt tiếp sau 1 giây, không chờ cron;
  - có yêu cầu trong lúc đang chạy thì cũng chạy thêm một lượt;
  - lỗi lặp lại không gây vòng lặp: lượt chỉ chạy tiếp khi hết giờ hoặc có yêu cầu mới.
- **Ghi dùng `skipDuplicates`:** lượt theo tin ghi cùng cặp xen giữa lúc xoá và lúc ghi thì giữ dòng của lượt kia, thay vì lỗi khoá trùng làm hỏng cả lô.
- **Q2 dùng đồng hồ server, lùi 5 giây** (`MATCH_SCORE_REMARK_CLOCK_MARGIN_MS`).
  - Đánh dấu thừa chỉ tốn một lần chấm lại.
  - Có người được đánh dấu lại thì yêu cầu ngay một lượt chấm theo ứng viên, không hẹn giờ cho từng người. Đang có lượt thì lượt đó chạy thêm một lượt. Script chạy process riêng (`rescore-match-scores`) không gọi được lượt của server, nên dấu chờ cron 15 phút.
  - Lượt đêm thêm một câu `UPDATE` mỗi tin, khoảng 314 câu ≈ 14 giây trên ~2–3 phút.
- **Tóm tắt lượt (Q6) làm luôn ở bước này.** Bước 8 chỉ còn phần đọc cho API Admin.
- **Việc kéo theo** làm ở bước 4 (xem mục dưới).

**Kiểm:**
- `tests/unit/live-rescore-batch.test.ts`, 22 test:
  - `similarityForPairs`: cùng cosine với `similarityForCandidates`; giới hạn chung, tin trước; model lỗi không phải deferred; lỗi DB không ném; vector cũ không dùng;
  - `scoreCandidatesAgainstJobs` cho cùng `MatchResult` với `scoreProfiles` ở cả `hybrid` lẫn `rule`, với bộ chấm thật (`ScoringJobMatcher`, trọng số thật);
  - cache: nạp phần thiếu, TTL, `invalidate` / `clear`, trần;
  - `drain`: lô và thứ tự; điểm null không có dòng; người không còn tin vẫn được xoá dòng cũ; vượt giới hạn embedding thì giữ dấu; lô lỗi; D2 (sửa trong lúc chấm thì giữ dấu); ứng viên đã xoá; BUSY rồi chạy thêm; hết giờ rồi chạy tiếp; lưu tóm tắt lỗi chỉ cảnh báo;
  - Q2: gọi đánh dấu lại với mốc lùi 5 giây rồi yêu cầu lượt chấm; không ai bị đánh dấu lại thì không yêu cầu; không truyền requester (script) vẫn chạy; GONE không gọi; lỗi chỉ ghi log.
- Test cũ sửa theo: marker có `jobProfileCache` giả (kiểm thứ tự tìm → đổi → xoá cache → đánh dấu); repository giả của `match-scores.test.ts` thêm `markChangedSince`.
- Toàn bộ unit test của server: 616 / 616 qua. `tsc --noEmit` qua.
- Trên Neon, script tạm (đã xoá), chỉ đọc. Câu ghi chỉ `EXPLAIN`, `maxNew = 0` và ghi vector bị chặn:
  - tham số `Date` đi dưới dạng `timestamptz`, `TimeZone` của Neon là `GMT`, nên so với cột `timestamp(3)` lưu UTC đúng tới mili giây (kiểm =, <, >);
  - `findMarkedBatch` (kèm danh sách loại trừ) chạy được, giờ DB lệch giờ server khoảng 0,1 giây;
  - 50 ứng viên có vector khớp hash: `findJobPools` trung vị 94 tin, tổng 4.256 cặp, khớp pool tính riêng từng người (10 / 10);
  - **theo lô = `scoreProfiles`:** 131 / 131 cặp trên 8 tin cho `MatchResult` giống hệt;
  - **theo lô so với bảng điểm:** 4.255 / 4.256 cặp khớp, 1 lệch (như bước 0);
  - một lô 50 người qua `rescoreBatch`, chưa tính ghi: 1,4 giây khi cache tin trống, 0,67–0,71 giây khi cache nóng. Phần ghi khoảng 8–9 round trip ≈ 0,4 giây, nên một lô ≈ 1,1 giây, 200 người ≈ 5 giây cộng 25 ms mỗi vector mới;
  - `EXPLAIN` xoá dòng (Hash Join), xoá dấu (Bitmap Heap Scan) và `markChangedSince` đều chạy được. Sau khi kiểm, Neon vẫn có 0 dấu.
- **Chưa chạy transaction ghi thật và chưa kiểm đầu cuối qua gateway 8080.** Chủ dự án sửa kỹ năng của một ứng viên. Sau ~45 giây, log server phải có "Live rescore run" với `candidates: 1`; DB có `matchRescoreRequestedAt` về null và dòng điểm của ứng viên có `scoredAt` mới.

### Bước 4 — Việc kéo theo (2026-11-14)

**Cách lấy "vừa đạt ngưỡng":** `replaceForCandidates` đổi câu xoá thành `DELETE … RETURNING`, trả lại dòng cũ. Câu lọc tin đang hiển thị trả thêm công ty, ngưỡng (`autoOutreachMinScore`) và cờ tự mời. Hàm thuần `diffCandidateScores` so cũ / mới và trả:
- `transitions`: cặp (ứng viên, tin) vừa vào ngưỡng (trước dưới ngưỡng hoặc chưa có dòng) hoặc vừa ra (nay dưới ngưỡng, hoặc dòng bị xoá vì hết chung kỹ năng);
- `newlyScored`: ứng viên lần đầu có điểm đầy đủ.

Không thêm round trip nào. Mỗi lô 50 người trả lại khoảng 4.000 dòng cũ.

**File mới trong `src/modules/live-rescore/`:**
- `live-rescore-follow-ups.ts` (`LiveRescoreFollowUps`):
  - `afterBatch` chạy sau mỗi lô đã commit;
  - `finishRun` chạy cuối lượt, cả khi lượt hỏng giữa chừng: các lô đã ghi vẫn được kích hoạt.
  - Mọi lỗi chỉ ghi log. Lô đã commit không bị tính là lô lỗi.
- `match-update-publisher.ts` (`MatchUpdatePublisher`): gửi `match-scores:updated` cho mọi employer của công ty. Mỗi công ty tối đa một sự kiện mỗi 15 giây (`LIVE_RESCORE_PUSH_THROTTLE_MS`). Phần dồn lại được gộp và gửi khi hết khoảng (hẹn giờ `unref`).

**Bốn việc:**
- **Tự mời:** lọc các cặp vừa đạt ngưỡng ở tin bật tự mời, rồi gọi `AutoOutreachRepository.clearExhaustedForMatches(pairs)`. Câu này làm ba việc:
  - lọc tin đang chạy tự mời (cùng điều kiện `findRunnableJobs`) và ứng viên còn mời được (cùng điều kiện `searchCandidatePool` có `excludeCappedToday`);
  - xoá dấu "hết ứng viên" của các tin đó;
  - trả công ty.

  Cuối lượt, mỗi công ty gọi `autoOutreachTrigger` một lần.
- **Tự chuyển "Đang xem xét":** `autoReviewTrigger({ candidateIds })` mỗi lô, với người có tin vừa đạt ngưỡng. `AutomationScope` thêm `candidateIds`; câu chọn sẵn có lọc thêm `a."candidateId" IN (…)`.
- **Job alert lần đầu (Q3):** gọi `candidateFirstScoredListener(newlyScored)` mỗi lô. Listener đăng ký ở module job-alerts, giống `jobScoredListener`, và gọi `JobAlertService.triggerFirstScored`, chạy trong cùng hàng đợi với `onJobScored`. Hàm `onCandidatesFirstScored`:
  - dùng một câu `insertFirstForCandidates` cho cả lô, cùng luật `alertTargetsSource` (ngưỡng max(X, 70), công tắc, thành phố, tài khoản `ACTIVE`, chưa ứng tuyển / được mời), thêm điều kiện ứng viên **chưa từng có** dòng `job_alerts`;
  - mỗi người một lần `upsertDaily("JOB_ALERT")`, với tin điểm cao nhất và số tin trong ngày.
- **Realtime (Q5):** gom công ty → tin có cặp vừa vào **hoặc vừa ra** ngưỡng. Cuối lượt gửi qua `MatchUpdatePublisher`. Port `RealtimeNotifier` thêm `pushMatchUpdate(userId, { jobPostIds })`; bản Socket.IO emit `match-scores:updated`, bản no-op bỏ qua.

**Khác so với plan:**
- **Theo lô thay cho từng người:** `autoReviewTrigger` nhận `{ candidateIds }` thay cho `{ candidateId }`; job alert là `onCandidatesFirstScored(candidateIds)`. Tránh 50 câu song song mỗi lô.
- **"Lần đầu có điểm"** = trước lô không có dòng nào **có phần ngữ nghĩa** với tin đang hiển thị, nay có ít nhất một dòng như vậy, **và** chưa từng có dòng `job_alerts`.
  - Dòng `semanticPending` (rule-only, người vượt giới hạn embedding) không tính. Người đó được báo ở lượt có điểm đầy đủ, không báo theo điểm rule-only.
  - Dòng với tin đã thôi hiển thị không xét.
  - Người mới được lượt đêm chấm trước lượt theo ứng viên thì không được báo lần đầu (đúng chữ của AD-27 mục 6).
- **Realtime gửi cả khi có người vừa rớt khỏi ngưỡng:** số "Phù hợp" giảm cũng phải làm mới. Chi phí như nhau.
- **Kích hoạt tự mời cả với tin chưa có dấu "hết ứng viên":** tin đó còn thiếu người, nên cũng cần xét ngay người vừa đạt ngưỡng. Chỉ kích hoạt khi có người **vừa** đạt ngưỡng và còn mời được, vì đến bước 6 một lượt tự mời vẫn chấm trực tiếp (Mây Xanh ~27 giây, bước 0 mục 5).
- **Kiểu payload** `MatchScoresUpdatedPayload` tạm đặt ở port. Bước 8 đưa vào `packages/shared-types` cho frontend.
- Tóm tắt lượt (Q6) thêm `followUps`: số cặp vừa đạt ngưỡng, công ty được kích hoạt tự mời, người gửi sang tự chuyển, người lần đầu có điểm, công ty nhận realtime. Tóm tắt lưu trước bước 4 không có trường này.

**Kiểm:**
- `tests/unit/live-rescore-follow-ups.test.ts`, 13 test:
  - `diffCandidateScores`: vào / ra ngưỡng, ngưỡng bằng điểm là đạt, dòng bị xoá, tin thôi hiển thị, các trường hợp "lần đầu";
  - việc kéo theo: chỉ cặp vừa đạt ở tin bật tự mời; tự chuyển theo người vừa đạt; job alert; gom công ty qua các lô; lỗi DB / trigger chỉ ghi log;
  - realtime: gửi ngay lần đầu, gộp trong khoảng chặn, công ty khác không bị chặn, lỗi tìm employer chỉ cảnh báo;
  - job alert lần đầu: sàn 70, một thông báo mỗi người với tin điểm cao nhất, số tin trong ngày, lỗi một người đi tiếp, hàng đợi;
  - scope `candidateIds` của tự chuyển (danh sách rỗng ⇒ `AND false`).
- `live-rescore-batch.test.ts` thêm 2 test: việc kéo theo chạy sau mỗi lô đã ghi, không chạy cho lô lỗi, `finishRun` một lần; lượt `FAILED` giữa chừng vẫn gửi việc kéo theo của lô đã ghi.
- Toàn bộ unit test của server: 631 / 631 qua. `tsc --noEmit` qua.
- Trên Neon, script tạm (đã xoá), chỉ đọc:
  - `EXPLAIN` (không `ANALYZE`) cho `DELETE … RETURNING` lô 50 người (Bitmap Heap Scan + Hash Join), `clearExhaustedForMatches` 200 cặp, `insertFirstForCandidates` 50 người: đều lập kế hoạch được;
  - chạy thật câu lọc tin kèm ngưỡng (314 tin, ~100 ms) và `findAutoReviewTargets({ candidateIds })` (~150 ms);
  - Neon vẫn 0 dấu.
- **Hiện Neon không có tin nào bật tự mời** (314 tin `PUBLISHED`, đều tắt). Kiểm đầu cuối phần tự mời cần bật tự mời cho một tin của Mây Xanh trước.
- **Chưa kiểm đầu cuối qua gateway 8080** (cùng lần kiểm bước 3).

**Bổ sung: model lỗi lúc chấm và job alert lần đầu (D+, chủ dự án chọn 2026-11-14):**
- **Lỗ hổng:** model lỗi (nạp hỏng, một lần embed quá 10 giây, worker chết) thì ứng viên có dòng rule-only. Người đó không vượt giới hạn 300 vector nên dấu bị xoá. Điểm được lượt đêm sửa, nhưng job alert lần đầu bị mất hẳn.
- **Đã cân nhắc:**
  - A: giữ dấu, cron chấm lại rule-only mỗi 15 phút;
  - A': định kỳ dò `semanticPending`, có hoặc không kèm cờ "vừa có lỗi";
  - D: để nguyên.

  Chọn D+: lượt đêm (vốn sửa điểm) báo luôn job alert lần đầu. Không có cờ trong bộ nhớ, không có câu quét riêng, không cần index.
- **Cách làm:**
  - `replaceForJob` đổi `deleteMany` thành `DELETE … RETURNING` trong CTE, trả `pendingBefore` (người có dòng cũ rule-only với tin). Không thêm câu; bình thường rỗng. Kiểu trả về đổi từ `boolean` sang `{ pendingBefore } | null` (null = tin thôi hiển thị).
  - `rescoreAll` đếm, với mỗi người, số tin có dòng cũ rule-only. Cuối lượt, chỉ khi có người như vậy, gọi `countVisibleRows`. Người có số tin rule-only ≥ số dòng hiện có, tức **mọi** dòng cũ đều rule-only, được gửi sang `candidateFirstScoredListener`.
  - `candidateFirstScoredListener` là tham số không bắt buộc của `MatchScoreService`; server truyền qua awilix.
- **Vì sao phải "mọi dòng":** câu xoá chạy theo từng tin. Nếu một tin thiếu vector, cả pool của tin có dòng rule-only. Báo cho cả pool thì mọi ứng viên chưa từng nhận job alert (phần lớn dữ liệu demo tạo trước 0.5) bị báo cùng lúc.
- `insertFirstForCandidates` thêm `NOT s."semanticPending"`: chỉ báo theo dòng có điểm đầy đủ, ở cả lối theo ứng viên lẫn lượt đêm. Nếu đêm đó model vẫn hỏng thì không ai bị báo; người đó còn dòng rule-only nên đêm sau được xét lại.
- Thông báo trong app tạo lúc ~3h30. Email gộp lúc 8h có các tin này.
- **Hạn chế:**
  - Script `rescore-match-scores` (process riêng) không truyền listener nên không báo. Nếu script chấm lại trước lượt đêm của server, người đó mất job alert lần đầu.
  - Lối a (tin mới đăng) và `rescoreJob` lẻ không báo.
  - Lượt đêm hết giờ giữa chừng thì tin chưa chấm còn dòng rule-only. Người đó bị loại ở đêm đó, vì số đếm không khớp.
- **Kiểm:**
  - `match-scores.test.ts` thêm 4 test: mọi dòng rule-only thì báo, vài tin thì không; không có dòng rule-only thì không thêm câu; script không báo; lỗi câu đếm chỉ ghi log; lối a không báo.
  - Toàn bộ 635 / 635 qua, `tsc` qua.
  - Neon, chỉ đọc: `EXPLAIN` câu xoá có `RETURNING` (tin 882 dòng) và câu job alert có điều kiện mới; `countVisibleRows` 50 người ~150 ms.

### Bước 5 — Danh mục đổi (2026-11-14)

Đánh dấu hàng loạt người có mục đó đã làm ở bước 2. Bước này thêm Q1: chấm lại theo tin cho các tin gắn mục đó.

- **Lấy tin trước khi đổi.** `LiveRescoreRepository.findVisibleJobIdsBySkills` / `findVisibleJobIdsByMajors`: tin đang hiển thị gắn kỹ năng (mọi trạng thái) hoặc ngành. Gọi trước thao tác, cùng lý do với danh sách người: từ chối xoá liên kết (cascade), gộp chuyển liên kết sang mục đích.
- **`CandidateRescoreMarker.markHolders`:** lấy người, lấy tin, chạy thao tác, xoá cache hồ sơ tin, **xếp tin vào hàng chờ**, rồi đánh dấu người. Xếp trước khi đánh dấu để lượt mà đánh dấu yêu cầu đã có sẵn tin trong hàng. Lấy tin hay xếp hàng lỗi chỉ ghi log; thao tác lỗi thì không xếp. Áp cho mọi lối đã nối ở bước 2 (Admin duyệt / từ chối / gộp kỹ năng, sửa tên / từ chối / gộp ngành, cron gộp LLM).
- **Hàng chờ nằm trong `LiveRescoreService`** (một `Set` trong bộ nhớ, tin trùng chỉ một lần). Marker gọi qua `liveRescoreJobRequester` (đăng ký `asValue`, resolve service lúc gọi, như `liveRescoreDrainRequester`). `requestJobRescore(ids)` xếp tin rồi yêu cầu một lượt.
- **Trong lượt:** phần theo ứng viên chạy trước. Còn giờ thì lần lượt từng tin gọi `MatchScoreService.rescoreJob` (không qua `trigger`, nên không gọi `jobScoredListener`, không sinh job alert), nhường event loop giữa hai tin, dùng chung giới hạn 60 giây. Hết giờ thì dừng, phần còn lại sang lượt chạy tiếp.
  - Tin đang được chấm ở lối khác (`SKIPPED RUNNING`, ví dụ lượt đêm đang chấm tin đó với hồ sơ nạp trước lúc đổi) thì xếp lại cho lượt sau.
  - Tin thôi hiển thị thì bỏ. Tin lỗi thì ghi log và bỏ khỏi hàng (lượt đêm sửa).
  - `rescoreJob` dùng cache hồ sơ riêng cho từng tin, như lối (a). Người trong pool sửa hồ sơ trong lúc chấm thì Q2 đánh dấu lại như thường.
- **Tóm tắt lượt** có thêm `jobs { rescored, deferred, failed, remaining }`. Lượt chạy tiếp khi hết giờ mà còn dấu **hoặc còn tin trong hàng**.
- **Không làm:** việc kéo theo của bước 4 (xoá dấu "hết ứng viên", kích hoạt tự mời, realtime) cho các dòng do hàng chờ theo tin ghi. Lối theo tin hiện có (lượt đêm, lối a) cũng không có. Người vừa đạt ngưỡng vì yêu cầu của tin đổi vẫn được cron tự mời 15 phút xét, trừ tin đang có dấu "hết ứng viên".
- **Hạn chế:** khởi động lại server thì mất hàng chờ. Người có mục đó vẫn còn dấu trong DB; người khác trong pool của tin giữ điểm cũ đến lượt đêm.

Kiểm:
- `live-rescore-marker.test.ts` thêm 3 test (thứ tự lấy tin → đổi → xếp → đánh dấu; không ai có ngành nhưng có tin vẫn xếp; lỗi lấy tin / xếp hàng / thao tác). Hai test cũ sửa thứ tự mong đợi vì có thêm bước lấy tin.
- `live-rescore-batch.test.ts` thêm 4 test (tin chấm sau phần theo ứng viên, trùng chỉ một lần; `RUNNING` xếp lại, lỗi và thôi hiển thị bỏ; hết giờ giữa hàng; phần theo ứng viên hết giờ thì tin sang lượt sau).
- Toàn bộ 642 / 642 qua, `tsc` qua.
- Neon, chỉ đọc: hai câu tìm tin với kỹ năng gắn nhiều tin nhất (96 tin) và ngành gắn nhiều tin nhất (43 tin), mỗi câu ~50 ms (gần như chỉ là round trip). Neon vẫn 0 dấu.
- Chưa đo trên branch `PERF_DATABASE_URL` thời gian đến khi hết dấu sau khi gộp một kỹ năng lớn (plan ghi ở mục kiểm của bước 5). Ước theo bước 0: ~96 tin × ~0,5 s ≈ 50 giây, tức một đến hai lượt.

### Bước 6 — Tự mời đọc bảng điểm (2026-11-14)

- **`AutoOutreachRepository.findScoredQueue(jobPostId, minScore, limit)`**, một câu:
  - điểm ≥ ngưỡng của tin;
  - còn mời được, cùng điều kiện `searchCandidatePool` có `excludeCappedToday`: bật cho liên hệ, chưa nộp đơn (mọi trạng thái), không có lời mời chặn, chưa đủ trần hôm nay;
  - sắp điểm giảm dần, bằng điểm thì nhiều kỹ năng `APPROVED` chung với tin hơn trước (như thứ tự pool cũ), rồi theo id;
  - dòng `semanticPending` vẫn được lấy;
  - dùng index `(jobPostId, score)`.
- **`findRunnableJobs`** trả thêm `matchScoresAt`. `AutoOutreachService.buildQueue` đọc bảng khi tin đã chấm, **không chấm lại**. Tin chưa chấm lần nào đi đường cũ (pool ≤ 50 rồi `scorePool`), nên `AUTO_OUTREACH_PREFILTER_LIMIT` vẫn còn chỗ dùng và được giữ.
- **Số người mỗi tin: 2R**, R là số lượt tự động còn lại của công ty lúc xét. Phần dư bù cho người bị `createInvitation` bỏ qua vì một lượt khác vừa mời, hay vừa đủ trần. Câu đọc bảng đã lọc trước những người không mời được, nên ít khi phải dùng tới phần dư.
- **`createInvitation`** nhận `match?: InvitationMatch | null`, với `InvitationMatch = Pick<MatchResult, "score" | "weightsVersion">`. `MatchResult` vẫn thoả kiểu này, nên mời tay, "Mời tất cả" và đường cũ của tự mời không phải sửa. Lượt tự mời đọc bảng truyền thẳng `{ score, weightsVersion }` từ bảng.
- Đặt / xoá dấu "hết ứng viên" và `hasCappedSkillMatch` giữ nguyên: hàng chờ rỗng thì đặt dấu, có người lại thì xoá dấu.

Kiểm:
- `auto-outreach-run.test.ts` thêm 3 test:
  - đọc bảng theo ngưỡng của tin, tối đa 2R, không lọc pool, không chấm lại, lưu điểm và phiên bản trọng số từ bảng, người bị bỏ qua có người kế tiếp thế chỗ;
  - không ai đạt ngưỡng thì đặt dấu, có người lại thì xoá dấu;
  - tin chưa chấm đi đường cũ trong cùng lượt.
- Toàn bộ 645 / 645 qua, `tsc` qua.
- Neon, chỉ đọc: câu đọc bảng cho cả 34 tin đang hiển thị của Mây Xanh, giới hạn 22 người, ngưỡng của từng tin. Tổng **~1,9 giây** (381 người vào hàng chờ, chậm nhất 89 ms mỗi tin, phần lớn là round trip). Mốc của đường cũ ở bước 0 là ~27 giây. `EXPLAIN ANALYZE` tin chậm nhất: dùng index `(jobPostId, score)`, chạy 0,8 ms.
- Chưa đo một lượt cron thật, vì Mây Xanh chưa có tin nào bật tự mời và lượt thật sẽ gửi lời mời (ghi DB).

### Bước 7 — Trang tìm ứng viên đọc bảng điểm (2026-11-14)

- **`CandidateOutreachService.searchCandidates`:** tin đã chấm (`matchScoresAt` khác null) thì lấy **10** người từ bảng bằng câu của bước 6 (`AutoOutreachRepository.findScoredQueue`), ngưỡng 0, kèm `includeCappedToday`. Không còn giới hạn pool 50 người nhiều kỹ năng chung nhất: người điểm cao mà ít kỹ năng chung giờ cũng hiện.
  - `findScoredQueue` thêm tuỳ chọn `includeCappedToday`: bỏ điều kiện trần ngày, như `searchCandidatePool` không bật `excludeCappedToday`. Trang vẫn hiện người đã đủ trần kèm `cappedToday` (nút mờ). Lượt tự mời không truyền tuỳ chọn nên giữ nguyên.
  - Chấm lại 10 người đó như trước (`scoreCandidates`), để có lý do và điểm mới nhất; sắp theo điểm vừa chấm, bằng điểm thì giữ thứ tự của bảng.
  - Tin chưa chấm lần nào đi đường cũ (pool ≤ 50 rồi chấm).
- **`findJobPost`** select thêm `matchScoresAt`; `OutreachJobPost` có thêm trường này.
- Dạng response không đổi. Số "M người phù hợp" vẫn lấy từ bảng như trước.
- **Hạn chế:** người mới chưa có dòng trong bảng (đang chờ lượt chấm theo ứng viên, ≤ 15 phút) chưa hiện ở trang. Đường cũ thì hiện ngay nếu lọt top 50 theo kỹ năng chung.

Kiểm:
- `outreach-create-invitation.test.ts` thêm 1 test: tin đã chấm thì gọi bảng (ngưỡng 0, tối đa 10, giữ người đủ trần), không gọi pool, sắp theo điểm vừa chấm, bằng điểm giữ thứ tự bảng, `cappedToday` đúng. Test cũ (tin chưa chấm) vẫn qua.
- Toàn bộ 646 / 646 qua, `tsc` qua.
- Neon, chỉ đọc: 6 tin (3 tin 882 dòng, 3 tin 22–91 dòng). Top 10 của câu **khớp 6 / 6** với cách tính độc lập (đọc mọi dòng của tin, lọc và sắp trong JS). Câu mất 55–116 ms mỗi tin, chủ yếu là round trip. `EXPLAIN ANALYZE`: dùng index `(jobPostId, score)`, chạy 0,8 ms.
- Thời gian cả trang: theo mốc ở bước 0 mục 5, đọc bảng rồi chấm lại 10 người mất 966–1.349 ms, so với 1.098–1.652 ms của đường cũ. Chưa đo lại qua API, vì chấm lại có thể ghi vector còn thiếu vào DB.

### Câu hỏi mới sau bước 0 (đã chốt 2026-11-14: Q7 = b, Q8 = b; xem "Câu hỏi đã chốt" và AD-27 mục 5, 11)

Đề xuất ban đầu được giữ lại dưới đây để thấy lý do. Q7 chốt khác đề xuất: chủ dự án chọn làm `worker_threads` ngay.

- **Q7 — Embedding chạy ở đâu.** Số đo bác giả thuyết tranh CPU, nên cấu hình C bị loại.
  - (a) Giữ A (như hiện tại). Đạt ngưỡng bước 10. Request chậm thêm 15–30 ms trong vài giây mỗi đợt.
  - (b) Chuyển model sang `worker_threads` (B): request không bị ảnh hưởng. Cần AD riêng, và đụng `SkillEmbeddingService` dùng chung với khử trùng kỹ năng và support-chat.
  - Đề xuất: **(a) cho 0.6**. Bước 10 đo lại trên server thật; vượt ngưỡng thì làm (b).
- **Q8 — Giảm round trip khi chấm.** Thời gian chấm do số câu × 44 ms quyết định.
  - (a) Bật preview `relationJoins`. Hai loader còn 1 câu mỗi loại: có cache ≈ 230 ms + ghi ≈ 180 ms mỗi ứng viên. Nhưng bật preview thì **mặc định của mọi truy vấn có `include` trong app đổi sang join**, phạm vi rộng.
  - (b) Chấm **theo lô** trong `drain`. Mỗi lô ~50 người dùng chung:
    - 1 câu pool ngược;
    - 7 câu nạp hồ sơ;
    - 1 câu hash / 1 câu cosine cho cả lô;
    - 1 transaction ghi cả lô kèm xoá dấu.

    Ước khoảng 17 round trip ≈ 0,8 s mỗi lô, cộng 25 ms mỗi vector mới. 200 ứng viên ≈ 10 giây, so với ~140 giây nếu chấm từng người. Đổi chữ "lần lượt từng ứng viên" ở D5 thành "lần lượt từng lô". D2 vẫn giữ: xoá dấu nếu dấu ≤ lúc bắt đầu lô.
  - (c) Giữ từng người như D5: ~0,7 s / người, 200 người cần 2–3 lượt 60 giây (~2,5 phút sau khi ngừng sửa).
  - Đề xuất: **(b)**. Không đổi cấu hình Prisma toàn app, và vừa sức khi demo 200 ứng viên một đợt.

## Phần 4 — Ghi chú của chủ dự án

