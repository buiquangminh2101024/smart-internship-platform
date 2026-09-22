# 03 — Đánh giá và hiệu chỉnh

Câu hỏi cần trả lời bằng số liệu: (1) `hybrid` có xếp/chấm đúng hơn `rule` không, (2) `lo/hi` và trọng số semantic nên chọn thế nào — mà **không tự lừa mình** bằng cách chỉnh tham số trên chính dữ liệu dùng để khoe kết quả. Tiêu chí gán nhãn chi tiết: `docs/06-backend/job-matcher-phase2/eval/labeling-guide.md`; kết quả chạy: `eval/eval-results.md`.

## 1. Khái niệm

**Nhãn thứ bậc (ordinal).** Mỗi cặp (ứng viên, tin) do **người** gán một trong ba mức: `POOR_MATCH` = 0, `PARTIAL_MATCH` = 1, `GOOD_MATCH` = 2. Nhãn không bao giờ do LLM hay do điểm của hệ thống gán.

**Chọn nhãn dùng để đo**, theo thứ tự ưu tiên:

1. `label` chốt cuối nếu có (dùng cho cặp hai người bất đồng, sau khi bàn lại);
2. hai người gán trùng nhau → nhãn đó;
3. chỉ một người gán → dùng nhãn đó và đánh dấu **tạm**;
4. hai người bất đồng mà chưa có `label` cuối, hoặc chưa ai gán → **loại** khỏi phép đo.

**Tách dev/test.** Tập dev để *chọn/chỉnh* tham số (`lo/hi`, ngưỡng, trọng số); tập test chỉ để *báo cáo*. Nếu chỉnh và báo cáo trên cùng một tập, con số báo cáo lạc quan giả tạo (chọn tham số làm khớp nhiễu của chính tập đó). Việc chia cố định trong `labels.json`, không random lúc chạy, để mọi lần chạy đều so sánh được.

**Quy tắc quyết định chốt trước khi có số** để không chọn tiêu chí sau khi đã thấy kết quả (mục 4).

## 2. Các chỉ số

### 2.1 Spearman ρ — điểm có xếp cùng chiều với nhãn không

Spearman là hệ số Pearson tính trên **hạng** [Spearman1904]; phù hợp vì nhãn chỉ có thứ bậc, không phải khoảng cách đều. Điểm hoà nhận **hạng trung bình**.

```text
ρ = Σ (rₓ − r̄ₓ)(r_y − r̄_y) / √( Σ (rₓ − r̄ₓ)² · Σ (r_y − r̄_y)² )
```

Không tính được (trả `null`) nếu n < 2 hoặc một biến không đổi (mẫu số 0). Công thức rút gọn 1 − 6Σd²/(n(n²−1)) chỉ đúng khi không có hạng hoà, mà nhãn 0/1/2 luôn có nhiều hạng hoà nên không dùng.

*Ví dụ:* điểm x = [10, 20, 30, 40, 50], nhãn y = [0, 0, 1, 2, 2].
Hạng x = 1..5 (trung bình 3) → độ lệch [−2, −1, 0, 1, 2]. Hạng y = [1,5; 1,5; 3; 4,5; 4,5] → độ lệch [−1,5; −1,5; 0; 1,5; 1,5].
Σ(dx·dy) = 3 + 1,5 + 0 + 1,5 + 3 = 9; Σdx² = 10; Σdy² = 9.
ρ = 9 / √(10 × 9) = 9/√90 ≈ **0,949**.

### 2.2 Accuracy 3 lớp, false positive, false negative

Đổi điểm thành nhãn bằng hai ngưỡng (mặc định 70/40):

```text
điểm ≥ 70 → GOOD;   40 ≤ điểm < 70 → PARTIAL;   điểm < 40 → POOR
accuracy = số cặp đoán đúng nhãn / tổng số cặp
```

- **False positive (FP):** nhãn POOR nhưng điểm ≥ 70 — hệ thống khen nhầm ứng viên không hợp. Đây là lỗi nặng nhất với nhà tuyển dụng.
- **False negative (FN):** nhãn GOOD nhưng điểm < 40 — bỏ sót ứng viên hợp.

FP/FN luôn tính theo ngưỡng mặc định 70/40 để so sánh công bằng giữa các cấu hình.

**Ngưỡng hiệu chỉnh trên dev** (chỉ là cột accuracy bổ sung): thử mọi cặp ngưỡng là bội số của 5, chọn cặp cho accuracy cao nhất trên dev; nếu hoà, chọn cặp gần 70/40 nhất. Nếu ngưỡng tune khác xa mặc định và accuracy trên test giảm, đó là dấu hiệu **overfit**.

### 2.3 NDCG@3 — chất lượng xếp hạng ứng viên cho một tin

Nhà tuyển dụng xem ứng viên **theo từng tin** nên đo xếp hạng trong phạm vi một tin [Jarvelin2002]. Độ lợi (gain) g của một cặp là giá trị nhãn 0/1/2.

```text
DCG@k  = Σ_{i=1..k} gᵢ / log₂(i + 1)          (gᵢ = độ lợi của cặp xếp thứ i theo điểm giảm dần)
IDCG@k = DCG@k của thứ tự lý tưởng (xếp theo nhãn giảm dần)
NDCG@k = DCG@k / IDCG@k                          ∈ [0, 1]
```

Kết quả cuối là **trung bình NDCG@3 trên các tin**. Tin có < 3 cặp, hoặc IDCG = 0 (toàn POOR), bị bỏ qua.

**Xử lý điểm hoà** [McSherry2008]: các cặp cùng điểm không có thứ tự thật, nên mỗi vị trí trong nhóm hoà nhận **độ lợi trung bình của nhóm**. Nhờ đó kết quả không phụ thuộc thứ tự đầu vào (nếu không, cấu hình cho nhiều điểm 0 hoặc 100 sẽ được lợi/hại tuỳ may rủi).

*Ví dụ:* một tin có 3 ứng viên với nhãn GOOD (2), PARTIAL (1), POOR (0).

- Lý tưởng: IDCG = 2/log₂2 + 1/log₂3 + 0/log₂4 = 2 + 0,631 + 0 = 2,631.
- Hệ thống xếp đúng thứ tự → NDCG = 1.
- Hệ thống xếp ngược (POOR, PARTIAL, GOOD): DCG = 0 + 1/log₂3 + 2/log₂4 = 0 + 0,631 + 1 = 1,631 → NDCG = 1,631/2,631 ≈ **0,620**.
- Cả ba hoà điểm: mỗi vị trí nhận độ lợi trung bình 1 → DCG = 1 + 0,631 + 0,5 = 2,131 → NDCG ≈ **0,810**.

### 2.4 Cohen's κ — nhãn của hai người có đáng tin không

```text
κ = (p₀ − pₑ) / (1 − pₑ)
p₀ = tỉ lệ hai người gán trùng nhau
pₑ = Σ_c  p_A(c) · p_B(c)     (xác suất trùng ngẫu nhiên, theo phân bố nhãn của từng người)
```

κ đã trừ phần trùng do may rủi [Cohen1960]; cách đọc thường dùng [Landis1977]: 0,41–0,60 vừa; 0,61–0,80 đáng kể; > 0,80 gần như hoàn hảo. Dùng bản **không có trọng số**, nên lệch GOOD↔PARTIAL bị phạt bằng lệch GOOD↔POOR — hạn chế đã biết. Chỉ tính trên cặp có nhãn của cả hai người.

*Ví dụ:* 4 cặp, người A: G, G, P, G; người B: G, G, P, P (G = GOOD, P = POOR). p₀ = 3/4 = 0,75; p_A(G) = 0,75, p_A(P) = 0,25, p_B(G) = 0,5, p_B(P) = 0,5 → pₑ = 0,375 + 0,125 = 0,5; κ = (0,75 − 0,5)/(1 − 0,5) = **0,5**.

## 3. Hiệu chỉnh tham số (chỉ trên dev)

1. **`lo/hi`:** `lo` = trung vị cosine của các cặp POOR, `hi` = trung vị của các cặp GOOD trên dev. Nếu kết quả có hi ≤ lo (dữ liệu không tách được) thì giữ giá trị tạm 0,20/0,70. Khoảng tách giữa trung vị các nhãn cũng là **phép kiểm tra embedding có mang tín hiệu hay không**: nếu cosine của POOR và GOOD gần như bằng nhau thì semantic vô ích.
2. **Lưới trọng số semantic** s ∈ {0,2; 0,3; 0,4}. Các thành phần còn lại giữ nguyên tỉ lệ của `hybrid-v1` và co lại để tổng bằng 1:
   `w'ᵢ = wᵢ · (1 − s) / (1 − 0,3)` với i ≠ semantic. Ví dụ s = 0,4: required = 0,40 × 0,6/0,7 ≈ 0,343.
3. **Chọn cấu hình** theo thứ tự: ρ cao hơn → NDCG@3 cao hơn → ít FP hơn. (Lưới nhỏ và có thể chọn trúng biên; đó là hạn chế, không tự mở rộng lưới sau khi thấy số.)
4. **Ngưỡng 70/40** tune riêng để làm cột accuracy phụ, không thay ngưỡng mặc định của FP/FN và của quy tắc quyết định.

**Tập chung (common set):** cặp không chấm được ở *bất kỳ* cấu hình nào (cosine `null`, hoặc rule trả `INSUFFICIENT_*`) bị loại khỏi *mọi* cấu hình, để các cấu hình được so trên đúng cùng tập cặp.

## 4. Quy tắc quyết định (chốt trước)

Chỉ đổi `JOB_MATCHER_MODE` mặc định sang `hybrid` nếu, **trên tập dev**, cả ba điều kiện cùng đúng:

```text
ρ(HYBRID) ≥ ρ(RULE)      và      NDCG@3(HYBRID) ≥ NDCG@3(RULE)      và      FP(HYBRID) ≤ FP(RULE)
```

Nếu không, giữ `rule` (vẫn giữ code hybrid). "Embedding không tốt hơn luật" là kết quả hợp lệ. Tập test không dùng để chọn.

Chỉ **sau khi có nhãn cuối** (đủ hai người gán, các cặp bất đồng đã có `label`) mới cập nhật `SEMANTIC_CALIBRATION`, trọng số và chế độ mặc định. Kết quả từ nhãn một người chỉ là tạm.

## 5. Pipeline đánh giá

```text
match-demo.json (ứng viên + tin tổng hợp, có ca khó có chủ đích)
   │  seed-match-demo.ts  ──►  DB (email <ref>@match-demo.local, company demo)
   ▼
labels.json  (người gán nhãn rater1/rater2, split dev/test, label cuối nếu bất đồng)
   ▼
eval-job-matching.ts
   1. đọc + kiểm tra nhãn (báo lỗi theo id cặp)
   2. dựng MatchInput bằng đúng loader + MatchEmbeddingService của service thật → cosine
   3. loại cặp không chấm được ở bất kỳ cấu hình nào
   4. dev: hiệu chỉnh lo/hi → chấm RULE, EMBEDDING_ONLY, HYBRID (hybrid-v1 và lưới) → chọn cấu hình, tune ngưỡng
   5. test: tính chỉ số (chỉ báo cáo)
   6. áp quy tắc quyết định; tính κ; liệt kê cặp FP/FN để phân tích lỗi
   ▼
eval/eval-results.md
```

| Việc | Vị trí |
|---|---|
| Hàm chỉ số thuần (parse nhãn, chọn nhãn, Spearman, NDCG, κ …) có test | `apps/server/scripts/lib/eval-metrics.ts`, `tests/unit/eval-metrics.test.ts` |
| Script đánh giá | `apps/server/scripts/eval-job-matching.ts` (`npm run eval-job-matching`) |
| Kết quả và phân tích lỗi từng cặp | `docs/06-backend/job-matcher-phase2/eval/eval-results.md` |

## 6. Hạn chế của phương pháp (nêu thẳng trong báo cáo)

1. **Cỡ mẫu nhỏ** (64 cặp, tập test 4 tin): chênh lệch vài phần trăm có thể chỉ là nhiễu; không đủ để kết luận có ý nghĩa thống kê.
2. **Dữ liệu tổng hợp**, do LLM sinh theo prompt có ràng buộc; "sạch" và đồng đều hơn hồ sơ thật. Phần lớn ca khó nằm ở dev nên số ở test có thể cao hơn dev mà không phản ánh chất lượng thật.
3. **Nhãn chủ quan**, người thiết kế dữ liệu cũng là người gán; κ chỉ giảm nhẹ rủi ro này, không loại bỏ.
4. **NDCG@3 trên tin ít ứng viên** rất thô (tin chỉ có vài cặp).
5. **Lưới trọng số nhỏ và cố định trước**, nên trọng số tốt nhất có thể nằm ngoài lưới; đồng thời mọi cấu hình đều dùng trọng số luật tay đặt, chưa học từ dữ liệu.
