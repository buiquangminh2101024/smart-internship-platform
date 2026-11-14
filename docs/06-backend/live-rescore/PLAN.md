# Chấm lại theo ứng viên gần thời gian thực (0.6) — Backend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-14). CHƯA TRIỂN KHAI.** Hướng đã chốt ở AD-27 trong buổi trao đổi với chủ dự án ngày 2026-11-14. Q1–Q6 đã chốt cùng ngày. Bước 0 (đo, chỉ đọc) làm được ngay.

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
| D5 | Chung process: một lượt mỗi lúc, lần lượt từng ứng viên, nhường event loop, giới hạn 60 giây và số embedding mới mỗi lượt, cache hồ sơ tin trong bộ nhớ (TTL 1 giờ, xoá khi danh mục đổi). |
| D6 | Admin đổi danh mục kỹ năng / ngành thì đánh dấu mọi ứng viên bị ảnh hưởng bằng SQL. |
| D7 | Sau khi chấm: kích hoạt tự mời (xoá dấu "hết ứng viên"), tự chuyển "Đang xem xét", job alert **chỉ lần đầu** có điểm, sự kiện realtime cho nhà tuyển dụng (gộp theo lượt). |
| D8 | Tự mời đọc bảng điểm; chỉ chấm trực tiếp lại số ít người sắp mời. Tin chưa chấm thì đi đường cũ. |
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

## Phần 1 — Công nghệ / package / kiến trúc

- **Không thêm dependency.** Dùng lại: Prisma (`$queryRaw`, transaction), `node-cron`, awilix, `setTimeout` / `setImmediate` của Node, `ioredis` sẵn có (Q6).
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
                   lặp người có dấu, dấu cũ nhất trước:
                     ├─ pool ngược: tin đang hiển thị có chung kỹ năng APPROVED
                     ├─ jobProfileCache.getMany(jobIds)  → nạp phần thiếu
                     ├─ chấm theo ứng viên (cùng bộ chấm với bảng)
                     ├─ MatchScoreRepository.replaceForCandidate (transaction)
                     ├─ xoá dấu nếu dấu ≤ lúc bắt đầu
                     └─ việc kéo theo:
                          ├─ tin bật tự mời vừa có người đạt ngưỡng → clearExhausted + autoOutreachTrigger(company)
                          ├─ autoReviewTrigger({ candidateId })
                          ├─ lần đầu có điểm → JobAlertService.onCandidateFirstScored (Q3)
                          └─ gom theo công ty → realtimeNotifier.pushMatchUpdate (Q5, gửi cuối lượt)

Lượt tự mời (AD-23): buildQueue đọc bảng điểm → chấm trực tiếp lại người sắp mời → createInvitation
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

- `Candidate.matchRescoreRequestedAt DateTime?` kèm index một phần `WHERE "matchRescoreRequestedAt" IS NOT NULL` (cron chỉ đọc người có dấu).
- `Candidate.matchProfileChangedAt DateTime?` (Q2).
- Nếu bước 0 mục 2 cần: index `job_post_skills("skillId")`.
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

### Bước 3 — Chấm theo ứng viên và ghi bảng

- `LiveRescoreRepository.findJobPool(candidateId)`: tin đang hiển thị (`VISIBLE_JOB`) có chung ≥ 1 kỹ năng `APPROVED` với ứng viên.
- `JobProfileCache` (bộ nhớ): `getMany(ids)` lấy mục còn hạn, nạp phần thiếu bằng `JobMatchProfileLoader.loadMany` (một câu) và vector tin; TTL 1 giờ; trần mục (mặc định 5.000), vượt thì bỏ mục dùng lâu nhất.
- Chấm theo ứng viên: thêm vào `CandidateOutreachService` (cạnh `scoreProfiles`) một hàm nhận một hồ sơ ứng viên và danh sách `JobMatchProfile`, cùng `JobMatcher`, cosine qua `similarityForJobs` (vector tin lấy từ cache khi có). **Test bắt buộc:** với 20 cặp lấy từ bộ demo, điểm theo ứng viên = điểm của `scoreProfiles`.
- `MatchScoreRepository.replaceForCandidate(candidateId, rows, scoredAt)`: trong một transaction, xoá dòng của ứng viên với các tin đang hiển thị, ghi dòng mới. Tin thôi hiển thị trong lúc chấm thì bỏ dòng của tin đó (lọc `VISIBLE_JOB` lúc ghi).
- `LiveRescoreService.drain(budgetMs)`:
  - đang có lượt thì chỉ đặt cờ "chạy thêm lượt nữa" rồi trả về (không chạy chồng);
  - lấy người có dấu, dấu cũ nhất trước, theo lô 50;
  - với mỗi người: ghi lúc bắt đầu, chấm, ghi bảng, xoá dấu có điều kiện (D2), gom việc kéo theo; nhường event loop;
  - giới hạn số embedding mới mỗi lượt; người vượt có `semanticPending` và **giữ** dấu;
  - hết giờ thì dừng; lỗi của một người chỉ ghi log và giữ dấu;
  - cuối lượt ghi tóm tắt (Q6), gửi sự kiện realtime gộp (Q5).
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

- `AutoOutreachService.buildQueue`: nếu tin đã có `matchScoresAt` thì đọc từ bảng những người điểm ≥ `minScore`, bật cho liên hệ, chưa nộp đơn, không có lời mời chặn, chưa đủ trần hôm nay; điểm giảm dần; lấy tối đa (số lượt còn lại × 2) người. Chấm trực tiếp lại nhóm này bằng `scorePool` để có `MatchResult`; bỏ người có điểm mới dưới ngưỡng. Tin chưa chấm thì giữ đường cũ.
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
3. **Đo tải bằng script mô phỏng:** 200 ứng viên trong một đợt. Đo event loop p99, `/api/health`, `/job-posts` và `GET /employer/dashboard/hiring-progress` (bị gọi lại theo sự kiện realtime) p50 / p95 so với lúc rảnh, thời gian đến khi hết dấu. Ngưỡng giữ chung process: event loop p99 < 100 ms và API nhẹ chậm không quá 2 lần (cùng ngưỡng plan 0.2), hoặc chậm quá 2 lần nhưng không quá vài giây mỗi đợt. Vượt ngưỡng thì áp cấu hình đã chọn ở bước 0 mục 3, đo lại; vẫn vượt thì dừng và hỏi chủ dự án.
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
| Bước 1–5 (dấu, hẹn giờ, chấm theo ứng viên, việc kéo theo, danh mục) | ~1–1,5 ngày |
| Bước 6–8 (tự mời và tìm ứng viên đọc bảng, thẻ 0%, API Admin) | ~0,5–1 ngày |
| Bước 9–11 (script mô phỏng, kiểm thử, tài liệu) | ~1 ngày |
| **Tổng backend** | **~3–4 ngày** |

Ước ban đầu ở backlog (1–1,5 ngày) chưa gồm: chuyển trang tìm ứng viên sang đọc bảng, cache hồ sơ tin, so cấu hình embedding, realtime và thẻ Admin.

## Ghi chú triển khai

(Chưa có.)

## Phần 4 — Ghi chú của chủ dự án

