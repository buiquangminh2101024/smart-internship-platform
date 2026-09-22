# 01 — Chấm điểm theo luật (GĐ1, `rule-v1`)

Bài toán: cho một hồ sơ ứng viên và một tin tuyển dụng, trả về **điểm 0–100** kèm bằng chứng giải thích được. GĐ1 chỉ dùng dữ liệu có cấu trúc (kỹ năng, số năm), không dùng mô hình học máy.

## 1. Khái niệm

**Content-based matching.** So đặc trưng của hồ sơ với đặc trưng của tin, không cần lịch sử ứng tuyển của người dùng khác [Lops2011]. Phù hợp khi chưa có dữ liệu tương tác thật (cold-start): hệ thống mới chưa có ai ứng tuyển để học từ đó.

**Tổng có trọng số (weighted sum).** Mỗi tiêu chí cho một điểm sᵢ ∈ [0, 1], điểm tổng là tổ hợp tuyến tính Σ wᵢ·sᵢ. Đây là dạng đơn giản nhất của ra quyết định đa tiêu chí; ưu điểm là mỗi điểm đều truy được về một tiêu chí cụ thể, nên giải thích được cho cả ứng viên lẫn nhà tuyển dụng. Nhược điểm: trọng số do người thiết kế đặt, không tự suy ra được.

**Unknown ≠ 0 (thiếu dữ liệu ≠ điểm 0).** Tin không ghi số năm kinh nghiệm không có nghĩa là mọi ứng viên đạt 0 điểm kinh nghiệm. Vì vậy thành phần không đánh giá được bị **loại** khỏi phép tính và trọng số còn lại được **chia lại** (renormalize). Mức độ thiếu dữ liệu chỉ ảnh hưởng đến `confidence`, không ảnh hưởng điểm.

## 2. Công thức

Ký hiệu: `R` = tập kỹ năng REQUIRED của tin, `P` = tập PREFERRED, `C` = tập kỹ năng của ứng viên (so theo `skillId` của catalog đã duyệt).

| Thành phần | Áp dụng khi | Điểm sᵢ ∈ [0, 1] |
|---|---|---|
| `requiredSkills` | R ≠ ∅ | \|R ∩ C\| / \|R\| |
| `preferredSkills` | P ≠ ∅ | \|P ∩ C\| / \|P\| |
| `experience` | tin có `minExperienceYears > 0` **và** ứng viên có tổng số năm | min(1, năm_ứng_viên / năm_yêu_cầu) |

Trọng số `RULE_WEIGHTS_V1`: requiredSkills 0,60 · preferredSkills 0,15 · experience 0,25.

**Chia lại trọng số:** gọi A là tập thành phần áp dụng được,

```
w'ᵢ = wᵢ / Σ_{j∈A} wⱼ          score = round( 100 · Σ_{i∈A} w'ᵢ · sᵢ )
```

**Trạng thái kinh nghiệm** (chỉ để hiển thị; điểm dùng công thức trên): năm ≥ yêu cầu → `MATCH`; năm ≥ 50% yêu cầu → `PARTIAL`; còn lại → `BELOW`; ứng viên chưa xác định được số năm → `UNKNOWN` (thành phần bị loại); tin không yêu cầu → `NOT_REQUIRED`.

**Không chấm được:** ứng viên chưa có kỹ năng nào → `INSUFFICIENT_PROFILE`; không thành phần nào áp dụng được → `INSUFFICIENT_JOB_DATA`. Cả hai trả `score = null`, không phải 0.

**Độ tin cậy** chỉ phụ thuộc độ đầy đủ hồ sơ: đếm số cờ đúng trong `completeness` — ≥ 3 → HIGH, 2 → MEDIUM, còn lại → LOW.

**Số năm kinh nghiệm của ứng viên** = tổng thời gian làm việc (hợp các khoảng của `WorkExperience`, khoảng chồng lấp chỉ tính một lần). `yearsOfExperience = 0` ở kỹ năng nghĩa là *chưa khai*, không phải "0 năm".

## 3. Ví dụ tính tay

**Ví dụ A — chia lại trọng số.** Tin: R = {Java, Spring, PostgreSQL}, P = {Docker}, không yêu cầu năm. Ứng viên có Java, Spring, Docker.

- s_required = 2/3 ≈ 0,667; s_preferred = 1/1 = 1; experience không áp dụng.
- A = {required, preferred}, Σw = 0,60 + 0,15 = 0,75.
- score = (0,60 × 0,667 + 0,15 × 1) / 0,75 = 0,55 / 0,75 = 0,733 → **73**.
- Nếu **không** chia lại: 0,55 → 55. Mọi tin không ghi số năm sẽ bị thiệt 25 điểm phần trăm oan.

**Ví dụ B — có kinh nghiệm.** Tin: R = {A, B}, không có P, yêu cầu 2 năm. Ứng viên có A, tổng 1,2 năm.

- s_required = 1/2 = 0,5; s_experience = min(1, 1,2/2) = 0,6 (trạng thái `PARTIAL` vì 1,2 ≥ 1,0); preferred không áp dụng.
- Σw = 0,60 + 0,25 = 0,85.
- score = (0,60 × 0,5 + 0,25 × 0,6) / 0,85 = 0,45 / 0,85 = 0,529 → **53**.

## 4. Áp dụng trong hệ thống

| Việc | Vị trí |
|---|---|
| Hàm chấm điểm thuần (không DB/mạng) | `apps/server/src/modules/job-matching/scoring-job-matcher.ts` — `ScoringJobMatcher.match` |
| Bảng trọng số có `version` | `job-matching.config.ts` — `RULE_WEIGHTS_V1` |
| Hằng số 50% cho `PARTIAL` | `EXPERIENCE_PARTIAL_RATIO` |
| Nạp hồ sơ / tin (chỉ kỹ năng APPROVED) | `candidate-match-profile.loader.ts`, `job-match-profile.loader.ts` |
| Test tính tay | `apps/server/tests/unit/scoring-job-matcher.test.ts` |

Đặt trọng số trong code (không ở `.env`) để có `version` và được review cùng code; `MatchResult.weightsVersion` ghi phiên bản đã dùng.

## 5. Hạn chế của phương pháp

1. **Vocabulary mismatch** [Furnas1987]: người ta gọi cùng một thứ bằng nhiều tên. Ở đây kỹ năng chỉ khớp khi trùng `skillId`; hai kỹ năng đồng nghĩa nhưng khác `skillId` (ví dụ "React" và "ReactJS" nếu catalog tách riêng) bị tính là thiếu. Đây là động lực của GĐ2.
2. **Khớp từ khoá dễ bị "nhồi":** hồ sơ liệt kê thật nhiều kỹ năng có thể đạt điểm cao dù không thực sự phù hợp.
3. **Kinh nghiệm là tổng thời gian**, chưa xét công việc có liên quan tới tin hay không — việc làm không liên quan vẫn được cộng. Số năm theo từng kỹ năng để dành cho GĐ3.
4. **Trọng số 0,60/0,15/0,25 là đề xuất ban đầu**, chưa có căn cứ thực nghiệm; phần đánh giá ở `03-evaluation.md` dùng để kiểm chứng ở mức chỉ báo.
