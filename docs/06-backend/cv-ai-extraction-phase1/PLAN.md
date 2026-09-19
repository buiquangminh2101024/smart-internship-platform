# CV AI Extraction — Phase 1: Trích xuất & Preview (Backend)

Không thuộc phase đánh số nào trong `PROJECT_PHASES.md` — retrofit cho module `cv` (Phase 7), đi trước và chuẩn bị cho Phase 11 (AI Features Boundary), cùng tinh thần với `docs/06-backend/jobpost-skill-huong-b/PLAN.md`. Dựa trên bản nháp `docs/temp/CV_OCR_PIPELINE_PROPOSAL.md` và `docs/temp/CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md` mục 9.1/9.3/9.4 — không chép lại nội dung đã bàn ở đó, chỉ ghi phần đặc thù/bổ sung khi lên kế hoạch cụ thể. Phạm vi Phase 1: từ lúc CV đã upload (không đổi) cho tới khi có kết quả trích xuất hiển thị preview cho Candidate xem — **chưa ghi bất kỳ dữ liệu nào vào `Education`/`WorkExperience`/...**, việc đó thuộc Phase 2 (`docs/06-backend/cv-ai-extraction-phase2/PLAN.md`).

**Trạng thái: đã code xong (2026-09-19), migration `20260919000000_add_cv_extraction_fields` đã viết nhưng chưa apply lên DB.**

## Điều chỉnh khi triển khai (so với phần kế hoạch bên dưới)

- **Type chia sẻ**: không mở rộng `CvRecord` mà thêm `CandidateCvRecord extends CvRecord` — `CvRecord` còn đi kèm `Application` sang phía Employer (`application.mapper.ts`), không lộ `extractedData` ra đó. Port `CvExtractor.ts` import lại `CvExtractionResult` từ `@sip/shared-types` thay vì khai báo lần 2.
- **OpenRouter**: model `qwen/qwen2.5-vl-3b-instruct:free` đã bị gỡ (404 lúc test). `OPENROUTER_MODEL` giờ nhận **danh sách phân tách bằng dấu phẩy**, gửi qua tham số `models` để OpenRouter tự chuyển model; mặc định `google/gemma-4-26b-a4b-it:free,dots-studio/dots-3-note-preview:free,qwen/qwen3.8-27b:free` (trộn nhà cung cấp — Gemma chạy trên Google AI Studio nên hay lỗi cùng lúc với Gemini). Timeout 90s (model free đo thực tế 9-20s).
- **Thêm tầng Gemini dự phòng** (`GEMINI_FALLBACK_MODEL`, mặc định `gemini-3.5-flash-lite`, cùng `GEMINI_API_KEY`) giữa Gemini chính và OpenRouter. Lý do: lúc test, `gemini-3.6-flash` trả 503 "high demand" liên tục kể cả khi retry sau 2s, trong khi `gemini-3.5-flash-lite` cùng key trả kết quả tốt trong ~3s (đọc đúng cả ảnh CV 590×762px mà Tesseract đọc ra rác). Lỗi 503 này theo từng model nên đổi model hiệu quả hơn retry — đã bỏ retry. `FallbackCvExtractor` tổng quát thành danh sách N tầng (`tiers`) thay vì cặp `primary`/`fallback`. Để trống biến này trong `.env` thì bỏ tầng 2. Đã cân nhắc thêm OCR.space thay cho Tesseract nhưng không làm: tầng OCR chỉ trả text thô dù đọc tốt đến đâu, OCR.space cần mạng (vô dụng đúng lúc mất mạng), giới hạn file của gói free nhỏ hơn giới hạn upload 5MB, và gửi dữ liệu cá nhân thêm cho một bên thứ ba.
- **Prompt**: thêm gợi ý CV Việt Nam ghi ngày theo NGÀY/THÁNG/NĂM. Model lite đôi khi vẫn đọc sai ngày ở PDF scan — Candidate tự sửa ở màn chỉnh sửa Phase 2.
- **Tesseract** (Quyết định #7): ở Node, core WASM nạp thẳng từ gói `tesseract.js-core` trong `node_modules` nên chỉ cần `cachePath`, không dùng `corePath`/`langPath`. Phải tự `mkdir` thư mục cache — `tesseract.js` ghi cache bằng `fs.writeFile` và nuốt lỗi nếu thư mục chưa có. Dung lượng thật chỉ **~6.7MB** (v7 tải bản LSTM-only: `eng` 5.2MB + `vie` 1.7MB), không phải 30-35MB.
- **File `.doc`** (Word đời cũ): upload vẫn được nhưng `/extract` trả 400 — `mammoth` chỉ đọc DOCX.
- **Chống double-submit** bằng khoá Redis `cv-extract-lock:<cvId>` (TTL 300s, trả 409) thay vì dựa vào `extractionStatus = PROCESSING` — status có thể kẹt mãi nếu server chết giữa chừng, khoá thì tự hết hạn.
- **Lỗi khi phân tích lại**: CV đã có kết quả cũ mà lần chạy mới lỗi thì trả về `DONE` (giữ kết quả cũ), chỉ CV chưa từng có kết quả mới thành `FAILED`. Response lỗi là 502.
- **Rate limit** bị trừ ngay trước bước gọi AI (sau khi tải file và trích text thành công) — lỗi định dạng/tải file không trừ lượt.
- **Nginx**: thêm location riêng cho `/api/candidates/me/cvs/:id/extract` với `proxy_read_timeout 300s` (mặc định 60s sẽ cắt request khi rơi xuống tầng dự phòng).
- File bổ sung ngoài danh sách Phần 1: `infrastructure/cv-extraction-prompt.ts` (prompt + response schema + hàm làm sạch output dùng chung cho 2 adapter), `tests/unit/cv-quality-gate.test.ts` (chạy `node --import tsx --test tests/unit/cv-quality-gate.test.ts` trong `apps/server`).

## Quyết định mới chốt khi lên kế hoạch (so với bản nháp `docs/temp`)

1. **Mở rộng `ALLOWED_CV_MIME_TYPES`** (`cv.service.ts`) và mime filter trong `cv.routes.ts` thêm `image/jpeg`, `image/png` — bản nháp gốc bàn cả nhánh "Image/Scan" nhưng upload hiện tại (Phase 7) chỉ cho phép PDF/DOC/DOCX. Giữ nguyên `MAX_CV_FILE_SIZE` (5MB).
2. **Bỏ vai trò Tesseract cho nhánh PDF/DOCX text kém** — khác với `CV_OCR_PIPELINE_PROPOSAL.md` mục 2 bước 4. Lý do: `tesseract.js` chỉ nhận input là ảnh, không đọc trực tiếp PDF/DOCX — muốn dùng được phải rasterize PDF ra ảnh trước (cần thêm thư viện/native binding, vi phạm nguyên tắc tối giản dependency, cùng lý do đã loại OpenCV ở bản nháp). Thay vào đó, PDF text kém thì **gửi thẳng file PDF gốc** cho Gemini — Gemini hỗ trợ nhận trực tiếp `application/pdf` làm input đa phương thức, không cần OCR rời. DOCX text kém vẫn dùng text đã trích (dù chất lượng thấp, không có "ảnh gốc" nào để gửi thay thế) — giới hạn đã biết, đã nêu ở bản nháp mục 2.2.
3. **Tesseract chỉ còn vai trò**: OCR ảnh chụp CV (nhánh Image/Scan) khi **cả Gemini lẫn OpenRouter đều lỗi** (mất mạng/hết quota) — lớp phòng vệ cuối cùng hoàn toàn offline. Trường hợp này không còn LLM khả dụng để cấu trúc hoá — trả thẳng text thô Tesseract đọc được qua field `rawOcrText`, `extractionConfidence: "low"`, các field cấu trúc để trống; Candidate tự nhập tay từ text thô hiển thị ở FE.
4. **Chạy đồng bộ trong request, không dùng job queue riêng** — `POST /candidates/me/cvs/:id/extract` chờ toàn bộ pipeline xong rồi mới trả response, vì đây chỉ là 1 lượt gọi LLM (vài giây), không đáng thêm hạ tầng hàng đợi (repo không có BullMQ/tương tự, đúng tinh thần modular monolith). Vì vậy **không tạo endpoint `GET .../extraction` riêng** như bản nháp `CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md` mục 9.3 dự kiến — chỉ mở rộng response của `GET /candidates/me/cvs`/`GET /candidates/me/cvs/:id` (đã có sẵn) để trả thêm field extraction. FE cần tăng timeout riêng cho lượt gọi này (xem PLAN frontend song song).
5. Ngưỡng "Text tốt?" cho DOCX **không chia theo trang** (khác PDF, đã chốt ở `CV_OCR_PIPELINE_PROPOSAL.md`) vì `mammoth` không cho biết số trang — dùng ngưỡng tuyệt đối: text < 200 ký tự **hoặc** > 10% ký tự lạ thì coi là kém.
6. Rate limit riêng cho `/extract` (bản nháp mục 9.4): **5/tuần, 15/tháng** mỗi user, **50/tuần** toàn hệ thống — tái dùng đúng khuôn `skill-rate-limit.service.ts` (Redis, khoá theo tuần ISO/tháng dương lịch).
7. **Trỏ cache `tesseract.js` ra ổ ngoài dự án**, cùng thư mục cache đang dùng cho model embedding của Skill (`EMBEDDING_MODEL_CACHE_DIR`, hiện là `D:\ai-models-cache\smart-internship-platform`) — thêm subfolder riêng, không lẫn với cache của `@huggingface/transformers`. Dung lượng thật (tra cứu lại, không phải ước lượng trong lúc bàn sơ bộ trước đây): core engine WASM ~4-5MB (tải 1 lần, dùng chung mọi ngôn ngữ), `eng.traineddata` ~22MB (tải nén ~10MB), `vie.traineddata` ~7MB — tổng khoảng 30-35MB nằm trên đĩa sau lần đầu chạy. `tesseract.js` hỗ trợ sẵn 3 option cấu hình đường dẫn khi `createWorker()`: `langPath` (nơi tải `.traineddata` về), `cachePath` (nơi cache lại trên đĩa, quan trọng nhất ở Node — không phải tải lại mỗi lần chạy), `corePath` (nơi đặt core WASM) — dùng đúng 3 option này để trỏ ra ngoài, không cần thêm dependency hay cấu hình phức tạp nào khác.

## Luồng xử lý

```text
POST /candidates/me/cvs/:id/extract
    │
    ▼
Xác nhận CV thuộc candidate hiện tại ── không phải chủ CV ──► 404
    │
    ▼
Rate-limit check (cv-extraction-rate-limit.service.ts) ── vượt quota ──► 429
    │                                                       (dừng, không đổi extractionStatus)
    ▼
extractionStatus = PROCESSING
    │
    ▼
Tải buffer file từ Cloudinary (fileUrl)
    │
    ▼
Detect loại file theo phần mở rộng
    │
    ├── PDF ──► pdf-parse (text + pageCount)
    │               │
    │          Quality gate: <50 ký tự/trang HOẶC >10% ký tự lạ?
    │               │
    │          tốt ─┴─ {kind:"text"}        kém ─ {kind:"pdf", buffer}
    │
    ├── DOCX ─► mammoth (text, không có pageCount)
    │               │
    │          Quality gate flat: <200 ký tự HOẶC >10% ký tự lạ?
    │               │ (kém vẫn dùng text — DOCX không có nhánh khác)
    │          luôn {kind:"text"}
    │
    └── Ảnh (jpg/png) ──► {kind:"image", buffer, mimeType}
                    │
    ┌───────────────┴──────────────────────────────────────┐
    ▼
cvExtractor.extract(input)  — FallbackCvExtractor
    │
    ├── Tầng 1: Gemini GEMINI_MODEL thành công ──────────────┐
    ├── lỗi → Tầng 2: Gemini GEMINI_FALLBACK_MODEL thành công┤
    ├── lỗi → Tầng 3: OpenRouter (free, nhiều model) thành công┤
    │                                                         │
    └── Cả 3 đều lỗi                                          │
            │                                                 │
       input là ảnh? ──NO──► extractionStatus = FAILED        │
            │YES                                              │
            ▼                                                 │
    Tesseract OCR local (vie+eng)                              │
    → rawOcrText, extractionConfidence:"low"                   │
            │                                                 │
            └─────────────────────────────────┬───────────────┘
                                                ▼
                            Ghi extractionStatus=DONE (hoặc FAILED),
                            extractedData, extractedAt
                                                │
                                                ▼
                              Trả về CvRecord đã cập nhật
```

## Ảnh tham khảo bố cục UI

Không cần (backend). Xem `docs/05-frontend/phases/cv-ai-extraction-phase1/PLAN.md`.

## Phần 1 — Công nghệ / package / kiến trúc

- **Dependency mới**: `pdf-parse` (trích text + số trang PDF), `mammoth` (trích text DOCX), `tesseract.js` (OCR ảnh, fallback cuối). Không thêm dependency cho OpenRouter — gọi thẳng REST (`https://openrouter.ai/api/v1/chat/completions`) qua `fetch`, API tương thích OpenAI, không cần SDK riêng.
- **Prisma** (`schema.prisma`) — mở rộng `Cv`:

```prisma
enum CvExtractionStatus {
  NOT_STARTED
  PROCESSING
  DONE
  FAILED
}

model Cv {
  // ...các field hiện có (id, candidateId, fileUrl, fileName, isDefault, uploadedAt)...
  extractionStatus CvExtractionStatus @default(NOT_STARTED)
  extractedData    Json?
  extractedAt      DateTime?
}
```

- **Port mới** `apps/server/src/shared/ports/CvExtractor.ts` (theo đúng khuôn `SkillMatchVerifier.ts`):

```ts
export type CvExtractionInput =
  | { kind: "text"; text: string }
  | { kind: "pdf"; buffer: Buffer }
  | { kind: "image"; buffer: Buffer; mimeType: string };

export interface CvExtractionResult {
  isValidCv: boolean;
  invalidReason: string | null;
  extractionConfidence: "high" | "low";
  rawOcrText: string | null; // chỉ có giá trị khi rơi vào fallback Tesseract (Quyết định #3)
  candidate: {
    fullName: string | null; // không map vào đâu ở Phase 2 — xem CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md mục 9.5
    headline: string | null;
    bio: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    gender: "MALE" | "FEMALE" | "OTHER" | null;
  };
  educations: Array<{
    universityName: string | null;
    majorName: string | null;
    degree: string | null;
    startYear: number | null;
    endYear: number | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  workExperiences: Array<{
    company: string;
    position: string;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  projects: Array<{
    name: string;
    description: string | null;
    url: string | null;
    isWorkingOn: boolean;
    startDate: string | null;
    endDate: string | null;
  }>;
  certificates: Array<{
    name: string;
    issuer: string | null;
    issueDate: string | null;
    credentialUrl: string | null;
    description: string | null;
  }>;
  awards: Array<{ name: string; issuer: string | null; date: string | null; description: string | null }>;
  skills: string[];
}

export interface CvExtractor {
  extract(input: CvExtractionInput): Promise<CvExtractionResult>;
}
```

- Adapter `apps/server/src/infrastructure/gemini-cv-extractor.ts` — `GeminiCvExtractor implements CvExtractor`, dùng `@google/genai` (đã có sẵn từ jobpost-skill-huong-b), gửi `text`/`pdf` (inlineData `application/pdf`)/`image` (inlineData theo `mimeType`) kèm prompt ép JSON schema (giống `RESPONSE_SCHEMA` của `GeminiSkillMatchVerifier`), ràng buộc rõ không bịa dữ liệu khi không phải CV (bản nháp mục 2.2).
- Adapter `apps/server/src/infrastructure/openrouter-cv-extractor.ts` — `OpenRouterCvExtractor implements CvExtractor`, gọi REST qua `fetch` (model mặc định `qwen/qwen2.5-vl-3b-instruct:free`, xem bản nháp mục 3.1), chỉ xử lý tốt `text`/`image`; nhận `kind: "pdf"` thì `throw` ngay (để `FallbackCvExtractor` biết bỏ qua thay vì silent-fail).
- Composite `apps/server/src/infrastructure/fallback-cv-extractor.ts` — `FallbackCvExtractor implements CvExtractor`, constructor nhận `{ primary, fallback, logger }`: gọi `primary.extract()`, nếu throw/timeout thì log rồi gọi `fallback.extract()`; nếu cả hai đều throw thì ném lỗi để tầng service set `extractionStatus: FAILED`.
- Module `apps/server/src/modules/cv/` (mở rộng module đã có, không tạo module mới — cùng thao tác trên `Cv`):

| File | Vai trò |
| --- | --- |
| `cv-quality-gate.util.ts` | Hàm thuần `isTextGoodEnough(text, pageCount): boolean` theo ngưỡng Quyết định #2/#5 |
| `cv-text-extractor.util.ts` | Wrap `pdf-parse`/`mammoth`, trả `{ text, pageCount: number \| null }` |
| `cv-tesseract-ocr.util.ts` | Wrap `tesseract.js` (traineddata `vie`+`eng`), chỉ dùng cho ảnh; `createWorker()` truyền `cachePath`/`corePath`/`langPath` trỏ ra `TESSERACT_CACHE_DIR` (Quyết định #7) |
| `cv-extraction-rate-limit.service.ts` | Y hệt `skill-rate-limit.service.ts`, hằng số riêng (Quyết định #6) |
| `cv-extraction-pipeline.service.ts` | Orchestrator: tải file từ Cloudinary → detect format → route theo Quyết định #1-3 → gọi `CvExtractor` → ghi kết quả vào `Cv` |

## Phần 2 — Liên kết giữa các phần

- **`POST /candidates/me/cvs/:id/extract`** (auth `CANDIDATE`, không cần file mới — dùng `fileUrl` đã lưu):
  1. Xác nhận CV thuộc candidate hiện tại (như các route CV khác).
  2. Rate-limit check (`cv-extraction-rate-limit.service.ts`) — vượt quota → 429, dừng ngay, không đổi `extractionStatus`.
  3. Set `extractionStatus: PROCESSING` (chặn double-submit nếu FE lỡ gọi 2 lần).
  4. `cv-extraction-pipeline.service.ts`:
     - Tải buffer từ `fileUrl` (Cloudinary) qua `fetch`.
     - Theo phần mở rộng file: **PDF** → `pdf-parse` → quality gate → tốt thì `{kind:"text"}`, kém thì `{kind:"pdf", buffer}`; **DOCX** → `mammoth` → quality gate (ngưỡng flat) → luôn `{kind:"text"}` (kém vẫn dùng text, không có nhánh khác); **ảnh** → `{kind:"image", buffer, mimeType}`.
     - Gọi `cvExtractor.extract(input)` (đã đăng ký `FallbackCvExtractor` trong container).
     - Riêng nhánh ảnh: nếu `FallbackCvExtractor` báo lỗi (cả 2 LLM đều fail) → gọi `cv-tesseract-ocr.util.ts` lấy text thô, đóng gói thủ công thành `CvExtractionResult` với `isValidCv: true`, `extractionConfidence: "low"`, `rawOcrText` có giá trị, mọi field cấu trúc để trống.
     - Ghi `extractionStatus: DONE` (hoặc `FAILED` nếu mọi thứ đều lỗi kể cả Tesseract — hiếm xảy ra vì Tesseract luôn chạy offline được), `extractedData`, `extractedAt`.
  5. Trả về `CvRecord` đã cập nhật đầy đủ field extraction.
- `cv.service.ts`: `listForCandidate`/`getForCandidate` không đổi logic — Prisma tự trả thêm field mới trong object.
- Đăng ký container (ngay trong `cvRouter`, giống cách `skillsRouter` tự đăng ký service của nó): `geminiCvExtractor: asClass(GeminiCvExtractor).singleton()`, `openRouterCvExtractor: asClass(OpenRouterCvExtractor).singleton()`, `cvExtractor: asFunction(({ geminiCvExtractor, openRouterCvExtractor, logger }) => new FallbackCvExtractor({ primary: geminiCvExtractor, fallback: openRouterCvExtractor, logger })).singleton()`.
- `.env`: `OPENROUTER_API_KEY` **đã có sẵn** (kiểm tra thực tế lúc lên kế hoạch — chỉ thiếu trong `.env.example`, cần bổ sung vào đó để đồng bộ tài liệu); `OPENROUTER_MODEL` (mặc định `qwen/qwen2.5-vl-3b-instruct:free`) và `TESSERACT_CACHE_DIR` (mặc định trỏ vào subfolder mới trong `D:\ai-models-cache\smart-internship-platform`, Quyết định #7) là 2 biến thật sự cần thêm mới. `GEMINI_API_KEY`/`GEMINI_MODEL` đã có sẵn từ jobpost-skill-huong-b, hỗ trợ multimodal đầy đủ (đã xác nhận `gemini-3.6-flash` nhận text/ảnh/PDF/video), không cần đổi.
- `packages/shared-types/src/index.ts`: mở rộng `CvRecord` thêm `extractionStatus: CvExtractionStatus`, `extractedData: CvExtractionResult | null`, `extractedAt: string | null`; thêm type `CvExtractionStatus`, `CvExtractionResult` (mirror port ở Phần 1).

## Phần 3 — Các bước thực hiện

1. `npm install pdf-parse mammoth tesseract.js --workspace=apps/server`.
2. `.env.example`: bổ sung `OPENROUTER_API_KEY` (đã có giá trị thật trong `.env`, chỉ thiếu dòng khai báo mẫu), thêm mới `OPENROUTER_MODEL`, `TESSERACT_CACHE_DIR`.
3. Sửa `schema.prisma` (Phần 1) → `npm run db:migrate --workspace=apps/server`.
4. Mở rộng `ALLOWED_CV_MIME_TYPES` (`cv.service.ts`) và mime filter trong `cv.routes.ts` thêm ảnh (Quyết định #1).
5. `shared/ports/CvExtractor.ts`.
6. `infrastructure/gemini-cv-extractor.ts`, `infrastructure/openrouter-cv-extractor.ts`, `infrastructure/fallback-cv-extractor.ts`.
7. `modules/cv/cv-quality-gate.util.ts` (kèm unit test thuần, không phụ thuộc DB/network).
8. `modules/cv/cv-text-extractor.util.ts`, `modules/cv/cv-tesseract-ocr.util.ts`.
9. `modules/cv/cv-extraction-rate-limit.service.ts`.
10. `modules/cv/cv-extraction-pipeline.service.ts` — orchestrator Phần 2.
11. Thêm route `POST /candidates/me/cvs/:id/extract` vào `cv.routes.ts`, method mới trong `cv.controller.ts`/`cv.service.ts`.
12. Đăng ký container (Phần 2).
13. Cập nhật `packages/shared-types/src/index.ts`.

## Cách test (Postman/curl, không cần frontend)

- Upload 1 PDF text thật (CV chuẩn) → `/extract` → `extractionStatus: DONE`, `extractedData.isValidCv: true`, các field khớp nội dung CV.
- Upload 1 PDF scan (ảnh chụp lưu dạng PDF, không có text layer) → `/extract` → quality gate NO → gửi thẳng PDF gốc cho Gemini → vẫn ra kết quả cấu trúc hợp lý (không qua Tesseract).
- Upload 1 ảnh JPG chụp CV rõ nét → `/extract` → nhánh ảnh → Gemini đọc trực tiếp → `DONE`.
- Upload 1 ảnh mờ/không liên quan (ảnh người, cây cối) → `/extract` → `isValidCv: false`, `invalidReason` có nội dung, các field còn lại rỗng — không bịa dữ liệu.
- Giả lập `GEMINI_API_KEY` rỗng/lỗi (mô phỏng mất mạng) khi upload ảnh → `FallbackCvExtractor` chuyển sang OpenRouter → vẫn ra kết quả (hoặc tiếp tục lỗi nếu OpenRouter cũng fail) → Tesseract chạy, trả `rawOcrText`, `extractionConfidence: "low"`.
- Gọi `/extract` liên tục > 5 lần/tuần cùng 1 user → lần thứ 6 bị chặn 429 kèm message rõ ràng.
- Gọi `/extract` lần 2 cho cùng 1 CV đã `DONE` → ghi đè `extractedData`/`extractedAt`, vẫn tính vào rate limit (không có ngoại lệ).
- `GET /candidates/me/cvs/:id` sau khi extract trả đầy đủ field `extractionStatus`/`extractedData`/`extractedAt`.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
