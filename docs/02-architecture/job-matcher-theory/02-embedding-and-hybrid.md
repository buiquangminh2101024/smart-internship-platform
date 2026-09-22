# 02 — Embedding ngữ nghĩa và hybrid (GĐ2)

Mục tiêu: bù điểm yếu của luật (`01-rule-based-scoring.md`) — luật chỉ khớp được khi hai bên dùng **đúng cùng một kỹ năng**, còn văn bản tự do (chức danh, mô tả, dự án) và kỹ năng đồng nghĩa thì luật không đọc được. Cách làm: biến văn bản thành vector, đo độ gần của hai vector, rồi ghép với điểm luật.

## 1. Khái niệm

**Giả thuyết phân bố.** Từ/cụm từ xuất hiện trong ngữ cảnh giống nhau thì có nghĩa gần nhau [Harris1954]. Mô hình ngôn ngữ hiện đại học biểu diễn (embedding) theo nguyên lý này [Mikolov2013][Devlin2019].

**Sentence embedding.** Ánh xạ cả một câu/đoạn thành **một vector cố định chiều**. Sentence-BERT dùng cùng một bộ mã hoá BERT (mạng siamese) cho hai câu, lấy vector câu bằng pooling, và huấn luyện để hai câu cùng nghĩa có vector gần nhau [Reimers2019]. Nhờ vậy so hai văn bản chỉ tốn một phép tích vô hướng, thay vì chạy mạng cho từng cặp.

**Model đang dùng:** `paraphrase-multilingual-MiniLM-L12-v2` (chạy local qua bản ONNX `Xenova/…`):

| Thuộc tính | Giá trị |
|---|---|
| Kiến trúc | MiniLM 12 lớp [Wang2020] — bản nén của transformer, nhỏ và nhanh trên CPU |
| Đa ngữ | Có tiếng Việt. Huấn luyện bằng *knowledge distillation* [Reimers2020]: model đa ngữ (student) học tái tạo vector của model đơn ngữ (teacher) cho cả câu gốc lẫn bản dịch |
| Đầu ra | vector **384 chiều**, mean pooling |
| Độ dài huấn luyện | `max_seq_length = 128` token |

Hàm mất mát distillation cho cặp câu song ngữ (sⱼ, tⱼ), teacher M, student M̂ [Reimers2020]:

```
L = (1/|B|) · Σⱼ [ (M(sⱼ) − M̂(sⱼ))² + (M(sⱼ) − M̂(tⱼ))² ]
```

**Mean pooling + chuẩn hoá.** Vector câu là trung bình vector của các token (có mask), rồi chia cho độ dài L2 để ‖u‖ = 1:

```
u = normalize( (1/n) · Σₜ hₜ )
```

**Cosine similarity** [Salton1975] đo góc giữa hai vector:

```
cos(u, v) = (u · v) / (‖u‖·‖v‖)   ∈ [−1, 1]
```

Vì vector đã chuẩn hoá (‖u‖ = ‖v‖ = 1), cosine chính là tích vô hướng u·v. pgvector cung cấp toán tử `<=>` là **khoảng cách cosine** = 1 − cos, nên cosine = `1 − (a <=> b)`.

**Cosine thô không trải đều trên [0, 1].** Vector của model thường tập trung trong một dải hẹp (hiện tượng *anisotropy*, được mô tả cho biểu diễn ngữ cảnh hoá ở [Ethayarajh2019]); cặp không liên quan vẫn có cosine khá cao. Với model cụ thể này, dự án **đo trực tiếp** trên dữ liệu demo thay vì suy từ bài báo. Vì vậy cần chuẩn hoá lại (mục 2).

**Hybrid.** [Burke2002] phân loại các cách ghép nhiều kỹ thuật gợi ý; hai cách dùng ở đây là:

- *weighted*: điểm cuối = tổ hợp có trọng số của điểm các kỹ thuật (luật + ngữ nghĩa);
- *switching*: chọn kỹ thuật theo điều kiện — chế độ `rule` hoặc `hybrid`, và **rơi về `rule-v1` khi thiếu cosine** (model lỗi, chưa có vector).

**Bộ nhớ đệm theo nội dung (content-addressed cache).** Vector chỉ tính lại khi nội dung đầu vào đổi: lưu kèm `contentHash`, lần sau so hash tại chỗ, không cần cờ "dirty" hay cron.

## 2. Công thức

**a) Chuẩn hoá cosine về [0, 1]** (thành phần `semantic`):

```
semantic = clamp( (cos − lo) / (hi − lo), 0, 1 )        yêu cầu hi > lo
```

`lo` = mức cosine coi như "không liên quan" (→ 0 điểm), `hi` = mức coi như "rất hợp" (→ 1). Hiệu chỉnh: `lo` = trung vị cosine các cặp POOR_MATCH, `hi` = trung vị các cặp GOOD_MATCH, **chỉ trên tập dev** (`03-evaluation.md` mục 3). Trung vị được chọn vì không bị vài điểm ngoại lai kéo lệch. Đây là **quyết định thiết kế của dự án**, không lấy từ một bài báo cụ thể. Giá trị tạm khi chưa có nhãn: `lo = 0,20`, `hi = 0,70`.

**b) Ghép hybrid:** `semantic` là thành phần thứ 5 trong cùng công thức của GĐ1 (chia lại trọng số trên các thành phần áp dụng được):

```
score = round( 100 · Σ_{i∈A} w'ᵢ · sᵢ ),   w'ᵢ = wᵢ / Σ_{j∈A} wⱼ,   i ∈ {required, preferred, experience, education, semantic}
```

| Cấu hình | required | preferred | experience | education | semantic |
|---|---|---|---|---|---|
| `rule-v1` | 0,60 | 0,15 | 0,25 | 0 | 0 |
| `embedding-only-v1` (chỉ để đánh giá) | 0 | 0 | 0 | 0 | 1 |
| `hybrid-v1` | 0,40 | 0,10 | 0,15 | 0,05 | 0,30 |

`semantic` chỉ 0,30 vì văn bản embed đã chứa tên kỹ năng, nên kỹ năng bị "tính hai lần" nếu để semantic quá cao. `education` chưa có nguồn dữ liệu nên luôn bị loại và chia lại (chỉ có nghĩa từ GĐ3).

**c) Khoá bộ nhớ đệm:**

```
contentHash = sha256( templateVersion | modelId | text )
```

Đổi mẫu văn bản, đổi model hoặc đổi nội dung đều làm hash khác đi và buộc tính lại vector.

## 3. Ví dụ

**Cosine — ví dụ 3 chiều** (thực tế 384 chiều): u = (0,6; 0,8; 0), v = (0,8; 0,6; 0), cả hai độ dài 1. cos = 0,6×0,8 + 0,8×0,6 + 0 = **0,96**; khoảng cách pgvector = 1 − 0,96 = 0,04.

**Chuẩn hoá** với lo = 0,25, hi = 0,75:

| cos | (cos − lo)/(hi − lo) | semantic |
|---|---|---|
| 0,62 | 0,37/0,50 = 0,74 | 0,74 |
| 0,90 | 0,65/0,50 = 1,30 | 1,00 (bị chặn) |
| 0,20 | −0,05/0,50 = −0,10 | 0,00 (bị chặn) |

Nếu dùng thẳng cos × 100 thì cặp rất hợp (0,62) chỉ được 62 điểm.

**Hybrid-v1** — cùng tin/ứng viên như ví dụ A của `01` (required = 2/3, preferred = 1, không yêu cầu năm), cosine 0,62, lo = 0,25, hi = 0,75 → semantic = 0,74:

- Thành phần áp dụng: required (0,40), preferred (0,10), semantic (0,30). Σw = 0,80 (experience và education bị loại).
- score = (0,40 × 0,667 + 0,10 × 1 + 0,30 × 0,74) / 0,80 = 0,589 / 0,80 = 0,736 → **74** (so với 73 của rule-v1).

Ví dụ này được dùng làm test trong `scoring-job-matcher.test.ts`.

**Dựng văn bản** (`templateVersion = 1`): cùng dữ liệu đầu vào cho cùng văn bản từng byte; dòng không có dữ liệu bị bỏ hẳn.

```text
# Hồ sơ                                   # Tin
Chức danh: Frontend Developer             Vị trí: Thực tập sinh Frontend Web
Ngành học: Công nghệ thông tin; Cử nhân   Kỹ năng bắt buộc: JavaScript, ReactJS
Kỹ năng: React, TypeScript, HTML/CSS      Kỹ năng ưu tiên: TypeScript
Kinh nghiệm: Thực tập sinh Frontend       Yêu cầu: (cắt 400 ký tự)
Dự án: Website bán hàng                   Mô tả: (cắt 300 ký tự)
Giới thiệu: (cắt 300 ký tự)
```

## 4. Áp dụng trong hệ thống

**Luồng cho một cặp (hồ sơ, tin) khi `JOB_MATCHER_MODE=hybrid`:**

```text
buildCandidateMatchText / buildJobMatchText  ─►  text
computeContentHash(templateVersion, modelId, text)  ─►  hash
so hash với candidate_embeddings / job_post_embeddings
   ├─ khớp ──► dùng vector đã lưu
   └─ khác/chưa có ──► EmbeddingProvider.embed(text)
          ├─ null (model lỗi) ──► cosine = null ──► rơi về rule-v1, ghi đúng weightsVersion
          └─ vector ──► upsert (cột vector(384))
cosine = SELECT 1 − (candidate.embedding <=> job.embedding)
semantic = clamp((cosine − lo)/(hi − lo), 0, 1)  ──►  ScoringJobMatcher (hybrid-v1)
```

| Việc | Vị trí |
|---|---|
| Dựng văn bản (hàm thuần, không đưa vào giới tính, ngày sinh, thành phố, SĐT, họ tên, tên trường, tên công ty cũ) | `modules/job-matching/match-text.builder.ts` |
| Hash, tính lười, cosine, hạn mức embed mới mỗi request (`MAX_NEW_EMBEDDINGS_PER_REQUEST = 30`) | `match-embedding.service.ts` |
| SQL cosine bằng pgvector | `match-embedding.repository.ts` |
| Gọi model (mean pooling, `normalize: true`) — adapter uỷ quyền cho `SkillEmbeddingService` của module `skills`, không nạp model lần hai | `modules/skills/skill-embedding.service.ts`, `infrastructure/skill-embedding-provider.ts` |
| Chuẩn hoá `lo/hi`, ghép trọng số | `scoring-job-matcher.ts` (`normalizeSimilarity`), `job-matching.config.ts` (`SEMANTIC_CALIBRATION`, `HYBRID_WEIGHTS_V1`) |
| Chọn chế độ, rơi về rule khi thiếu cosine | `job-matching.service.ts`, env `JOB_MATCHER_MODE` |

Các chọn lựa gắn với lý thuyết ở trên:

- Văn bản **ngắn, xếp theo độ quan trọng giảm dần**: model học với câu ≤ 128 token; nếu bị cắt thì cắt phần ít quan trọng nhất. Thư viện suy luận thực tế cắt ở 512 token (đã đo ở bước 1 của GĐ2), nên phần đuôi vẫn ảnh hưởng vector — vì vậy vẫn giữ văn bản ngắn.
- Không đưa dữ liệu nhạy cảm vào văn bản embed để điểm không phụ thuộc giới tính, nơi ở, trường học…

## 5. Hạn chế của phương pháp

1. **Model học từ dữ liệu paraphrase, không phải CV–tin tuyển dụng.** Cosine đo "hai đoạn văn gần nghĩa", không đo trực tiếp "ứng viên đủ điều kiện". Model cũng đối xứng, trong khi bài toán bất đối xứng (tin *yêu cầu*, hồ sơ *đáp ứng*).
2. **Không giải thích được từng điểm** như luật: chỉ có một con số cosine. Vì vậy trọng số semantic thấp và luôn hiển thị kèm bằng chứng của luật.
3. **`lo/hi` phụ thuộc bộ nhãn nhỏ** (vài chục cặp, dữ liệu tổng hợp); phải báo cáo như kết quả chỉ báo.
4. **Cosine nhạy với mẫu văn bản:** đổi mẫu là đổi phân bố cosine, nên `lo/hi` phải hiệu chỉnh lại (đổi `MATCH_EMBEDDING_TEMPLATE_VERSION` cũng buộc tính lại toàn bộ vector).
5. Model chạy CPU: request đầu tiên chậm vì nạp model; danh sách đơn của Employer chỉ embed tối đa 30 hồ sơ mới mỗi lần, phần còn lại hiển thị `PENDING` và đầy dần.
