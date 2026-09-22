# Kết quả đánh giá Job Matcher GĐ2

> Sinh tự động bởi `apps/server/scripts/eval-job-matching.ts` lúc 2026-09-22T06:22:01.894Z — không sửa tay; chạy lại script để cập nhật. Phương pháp: `../PLAN.md` mục "Bộ đánh giá"; tiêu chí nhãn: `labeling-guide.md`.

Model embedding `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, mẫu văn bản v1. Cỡ mẫu nhỏ, dữ liệu tổng hợp: mọi con số chỉ mang tính chỉ báo, không đủ kết luận có ý nghĩa thống kê.

## Dữ liệu và nhãn

- Cặp trong `labels.json`: 64; dùng để đo: 64.
- Nguồn nhãn: `label` cuối 25 · hai người trùng nhau 39 · một người (tạm) 0.

| Tập | Số tin | Số cặp | GOOD | PARTIAL | POOR |
| --- | --- | --- | --- | --- | --- |
| dev | 6 | 38 | 7 | 13 | 18 |
| test | 4 | 26 | 5 | 6 | 15 |

## Độ tin cậy của nhãn

Cohen's κ (không trọng số, 3 nhãn) trên 64 cặp có đủ hai người: **0,387**; tỉ lệ trùng khớp thô 61%.

## Hiệu chỉnh `lo/hi` (chỉ trên dev)

Cosine thô theo nhãn — mức tách giữa các nhãn cho biết embedding có mang tín hiệu hay không:

| Tập | Nhãn | n | Trung vị | Nhỏ nhất | Lớn nhất |
| --- | --- | --- | --- | --- | --- |
| dev | GOOD_MATCH | 7 | 0,728 | 0,620 | 0,763 |
| dev | PARTIAL_MATCH | 13 | 0,544 | 0,469 | 0,716 |
| dev | POOR_MATCH | 18 | 0,444 | 0,311 | 0,600 |
| test | GOOD_MATCH | 5 | 0,739 | 0,586 | 0,825 |
| test | PARTIAL_MATCH | 6 | 0,617 | 0,402 | 0,672 |
| test | POOR_MATCH | 15 | 0,408 | 0,260 | 0,552 |

Kết quả: `lo = 0,4442` (trung vị cosine POOR của dev), `hi = 0,7277` (trung vị GOOD của dev) — giá trị tạm đang dùng là 0,44/0,73.

## Lưới trọng số semantic (chỉ trên dev)

Phần không phải semantic chia lại theo đúng tỉ lệ của hybrid-v1 (0,4 : 0,1 : 0,15 : 0,05). Chọn theo ρ, rồi NDCG@3, rồi ít FP hơn.

| semantic | requiredSkills | preferredSkills | experience | education | ρ | NDCG@3 | FP | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0,20 | 0,4571 | 0,1143 | 0,1714 | 0,0571 | 0,746 | 0,887 | 0 |  |
| 0,30 | 0,4000 | 0,1000 | 0,1500 | 0,0500 | 0,784 | 0,978 | 0 |  |
| 0,40 | 0,3429 | 0,0857 | 0,1286 | 0,0429 | 0,789 | 0,965 | 0 | **chọn** |

## Kết quả

Ngưỡng mặc định ≥ 70 GOOD, 40–69 PARTIAL, < 40 POOR. "Acc (dev)" dùng ngưỡng hiệu chỉnh trên dev của từng cấu hình (bội số của 5). FP = POOR mà điểm ≥ 70; FN = GOOD mà điểm < 40 (ngưỡng mặc định). NDCG@3 tính trên các tin có ≥ 3 cặp và ít nhất một cặp không POOR; điểm hoà được lấy độ lợi trung bình.

### Tập dev

| Cấu hình | n | Spearman ρ | NDCG@3 (số tin) | Acc (mặc định) | Acc (dev) — ngưỡng | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RULE (rule-v1) | 38 | 0,671 | 0,904 (6) | 66% | 74% — 90/30 | 0 | 1 |
| EMBEDDING_ONLY (lo/hi hiệu chỉnh) | 38 | 0,778 | 0,961 (6) | 63% | 76% — 75/20 | 0 | 0 |
| HYBRID hybrid-v1 (semantic 0,30, lo/hi hiện tại 0,4442/0,7277) | 38 | 0,784 | 0,978 (6) | 71% | 74% — 70/25 | 0 | 0 |
| HYBRID semantic 0,4 (lo/hi hiệu chỉnh) — **chọn** | 38 | 0,789 | 0,965 (6) | 71% | 76% — 70/15 | 0 | 0 |

### Tập test (chỉ để báo cáo)

| Cấu hình | n | Spearman ρ | NDCG@3 (số tin) | Acc (mặc định) | Acc (dev) — ngưỡng | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RULE (rule-v1) | 26 | 0,881 | 0,994 (4) | 92% | 88% — 90/30 | 0 | 0 |
| EMBEDDING_ONLY (lo/hi hiệu chỉnh) | 26 | 0,823 | 0,991 (4) | 85% | 77% — 75/20 | 0 | 0 |
| HYBRID hybrid-v1 (semantic 0,30, lo/hi hiện tại 0,4442/0,7277) | 26 | 0,876 | 1,000 (4) | 92% | 92% — 70/25 | 0 | 0 |
| HYBRID semantic 0,4 (lo/hi hiệu chỉnh) — **chọn** | 26 | 0,872 | 1,000 (4) | 88% | 85% — 70/15 | 0 | 0 |

## Quy tắc quyết định (chốt trước trong PLAN, chỉ xét dev)

Đổi `JOB_MATCHER_MODE` mặc định sang `hybrid` chỉ khi HYBRID ≥ RULE ở cả Spearman ρ lẫn NDCG@3 và không tăng false positive.

| Điều kiện | HYBRID đã chọn vs RULE | Đạt | hybrid-v1 (semantic 0,30, chưa hiệu chỉnh trọng số) vs RULE | Đạt |
| --- | --- | --- | --- | --- |
| Spearman ρ | 0,789 vs 0,671 | ✓ | 0,784 vs 0,671 | ✓ |
| NDCG@3 | 0,965 vs 0,904 | ✓ | 0,978 vs 0,904 | ✓ |
| False positive | 0 vs 0 | ✓ | 0 vs 0 | ✓ |

**Đạt** — có căn cứ đổi mặc định sang `hybrid` với `lo/hi = 0,4442/0,7277` và semantic = 0,40.

**Trạng thái áp dụng:** ✓ đã áp vào config — `JOB_MATCHER_MODE=hybrid`, `SEMANTIC_CALIBRATION` khớp giá trị hiệu chỉnh ở trên.

## Phân tích lỗi (ngưỡng mặc định)

### RULE (rule-v1): 1 cặp sai nghiêm trọng (FP/FN)

| Cặp | Tập | Hồ sơ | Tin | Nhãn | Điểm | Loại | category | Ca khó |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p01 | dev | fe-react-03 | Thực tập sinh Frontend Web | GOOD | 13 | FN | hard-case | synonym-skill, adjacent-field |

### HYBRID semantic 0,4 (lo/hi hiệu chỉnh): 0 cặp sai nghiêm trọng (FP/FN)

Không có.

## Phụ lục — điểm từng cặp

Dấu ✗ khi lớp suy ra từ điểm (ngưỡng mặc định) khác nhãn. Cột HYBRID là cấu hình đã chọn (semantic 0,40).

| Cặp | Tập | Hồ sơ | Tin | Nhãn | Nguồn | Cosine | RULE | EMB | hybrid-v1 | HYBRID | category | Ca khó |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p01 | dev | fe-react-03 | Thực tập sinh Frontend Web | GOOD | 2 người | 0,763 | 13 ✗ | 100 | 46 ✗ | 55 ✗ | hard-case | synonym-skill, adjacent-field |
| p02 | dev | fe-react-03 | Thực tập sinh Frontend Product | PARTIAL | label | 0,645 | 13 ✗ | 71 ✗ | 30 ✗ | 36 ✗ | same-domain | synonym-skill |
| p03 | dev | fe-react-03 | Thực tập sinh Backend Node TypeScript | POOR | 2 người | 0,506 | 0 | 22 | 8 | 11 | adjacent | synonym-skill |
| p04 | dev | fe-react-03 | Thực tập sinh QA Automation | POOR | label | 0,426 | 0 | 0 | 0 | 0 | adjacent | synonym-skill, abbreviated-jd |
| p05 | dev | fe-typescript-04 | Thực tập sinh Frontend Product | GOOD | 2 người | 0,678 | 83 | 83 | 83 | 83 | same-domain | — |
| p06 | dev | fe-typescript-04 | Thực tập sinh Backend Node TypeScript | POOR | 2 người | 0,566 | 40 ✗ | 43 ✗ | 41 ✗ | 41 ✗ | adjacent | — |
| p07 | test | fe-typescript-04 | Thực tập sinh Thiết kế UI | PARTIAL | label | 0,561 | 43 | 41 | 42 | 42 | adjacent | — |
| p08 | test | fe-typescript-04 | Thực tập sinh Content Marketing | POOR | 2 người | 0,432 | 0 | 0 | 0 | 0 | cross-domain | — |
| p09 | dev | backend-node-02 | Thực tập sinh Backend Node TypeScript | GOOD | 2 người | 0,714 | 60 ✗ | 95 | 73 | 77 | hard-case | synonym-skill |
| p10 | dev | backend-node-02 | Thực tập sinh Java Backend | PARTIAL | 2 người | 0,553 | 0 ✗ | 38 ✗ | 14 ✗ | 19 ✗ | adjacent | synonym-skill |
| p11 | dev | backend-node-02 | Thực tập sinh Frontend Web | POOR | 2 người | 0,600 | 0 | 55 ✗ | 21 | 27 | adjacent | synonym-skill, adjacent-field |
| p12 | dev | backend-node-02 | Thực tập sinh Data & AI | POOR | 2 người | 0,588 | 25 | 51 ✗ | 32 | 35 | adjacent | synonym-skill |
| p13 | dev | backend-java-01 | Thực tập sinh Java Backend | GOOD | 2 người | 0,728 | 100 | 100 | 100 | 100 | same-domain | — |
| p14 | dev | backend-java-01 | Thực tập sinh Backend Node TypeScript | PARTIAL | label | 0,509 | 0 ✗ | 23 ✗ | 9 ✗ | 11 ✗ | adjacent | — |
| p15 | dev | backend-java-01 | Thực tập sinh QA Automation | POOR | label | 0,446 | 5 | 1 | 3 | 3 | adjacent | abbreviated-jd |
| p16 | test | backend-java-01 | Thực tập sinh Kế toán | POOR | 2 người | 0,455 | 0 | 4 | 1 | 2 | cross-domain | — |
| p17 | dev | data-ai-02 | Thực tập sinh Data & AI | GOOD | 2 người | 0,740 | 100 | 100 | 100 | 100 | hard-case | adjacent-field |
| p18 | dev | data-ai-02 | Thực tập sinh Backend Node TypeScript | POOR | 2 người | 0,311 | 0 | 0 | 0 | 0 | adjacent | adjacent-field |
| p19 | dev | data-ai-02 | Thực tập sinh QA Automation | POOR | 2 người | 0,443 | 5 | 0 | 3 | 3 | adjacent | adjacent-field, abbreviated-jd |
| p20 | test | data-ai-02 | Thực tập sinh Kế toán | POOR | label | 0,504 | 0 | 21 | 8 | 10 | cross-domain | adjacent-field |
| p21 | dev | qa-03 | Thực tập sinh QA Automation | GOOD | 2 người | 0,731 | 100 | 100 | 100 | 100 | same-domain | abbreviated-jd |
| p22 | dev | qa-03 | Thực tập sinh Backend Node TypeScript | POOR | label | 0,373 | 0 | 0 | 0 | 0 | adjacent | — |
| p23 | dev | qa-03 | Thực tập sinh Frontend Web | POOR | label | 0,538 | 40 ✗ | 33 | 37 | 37 | adjacent | adjacent-field |
| p24 | test | qa-03 | Thực tập sinh Kế toán | POOR | 2 người | 0,544 | 0 | 35 | 13 | 17 | cross-domain | — |
| p25 | test | marketing-content-01 | Thực tập sinh Content Marketing | GOOD | 2 người | 0,758 | 93 | 100 | 96 | 97 | same-domain | — |
| p26 | test | marketing-content-01 | Thực tập sinh Digital Marketing | PARTIAL | label | 0,672 | 56 | 80 ✗ | 63 | 66 | same-domain | — |
| p27 | test | marketing-content-01 | Thực tập sinh Thiết kế UI | POOR | 2 người | 0,438 | 26 | 0 | 17 | 14 | adjacent | — |
| p28 | dev | marketing-content-01 | Thực tập sinh Frontend Product | POOR | 2 người | 0,460 | 21 | 6 | 15 | 14 | cross-domain | — |
| p29 | test | marketing-digital-02 | Thực tập sinh Digital Marketing | GOOD | 2 người | 0,739 | 91 | 100 | 94 | 95 | same-domain | — |
| p30 | test | marketing-digital-02 | Thực tập sinh Content Marketing | PARTIAL | label | 0,626 | 53 | 64 | 57 | 58 | same-domain | — |
| p31 | test | marketing-digital-02 | Thực tập sinh Kế toán | POOR | label | 0,471 | 40 ✗ | 9 | 28 | 25 | cross-domain | — |
| p32 | dev | marketing-digital-02 | Thực tập sinh Data & AI | POOR | 2 người | 0,379 | 21 | 0 | 13 | 11 | adjacent | — |
| p33 | test | accounting-01 | Thực tập sinh Kế toán | GOOD | 2 người | 0,703 | 100 | 91 | 97 | 96 | same-domain | — |
| p34 | test | accounting-01 | Thực tập sinh Digital Marketing | POOR | label | 0,262 | 0 | 0 | 0 | 0 | cross-domain | — |
| p35 | dev | accounting-01 | Thực tập sinh Data & AI | POOR | label | 0,398 | 0 | 0 | 0 | 0 | adjacent | — |
| p36 | test | finance-02 | Thực tập sinh Kế toán | PARTIAL | 2 người | 0,646 | 47 | 71 ✗ | 56 | 59 | adjacent | — |
| p37 | dev | finance-02 | Thực tập sinh Data & AI | POOR | 2 người | 0,353 | 18 | 0 | 11 | 10 | adjacent | — |
| p38 | test | finance-02 | Thực tập sinh Content Marketing | POOR | 2 người | 0,260 | 7 | 0 | 4 | 3 | cross-domain | — |
| p39 | test | designer-01 | Thực tập sinh Thiết kế UI | GOOD | 2 người | 0,825 | 96 | 100 | 97 | 98 | same-domain | — |
| p40 | dev | designer-01 | Thực tập sinh Frontend Product | PARTIAL | label | 0,626 | 31 ✗ | 64 | 41 | 44 | adjacent | — |
| p41 | test | designer-01 | Thực tập sinh Content Marketing | POOR | 2 người | 0,325 | 7 | 0 | 4 | 3 | adjacent | — |
| p42 | dev | mobile-02 | Thực tập sinh Java Backend | PARTIAL | label | 0,502 | 53 | 20 ✗ | 41 | 37 ✗ | adjacent | adjacent-field |
| p43 | dev | mobile-02 | Thực tập sinh Frontend Web | POOR | 2 người | 0,487 | 7 | 15 | 10 | 11 | adjacent | adjacent-field |
| p44 | dev | irrelevant-experience-01 | Thực tập sinh Backend Node TypeScript | PARTIAL | label | 0,516 | 40 | 25 ✗ | 34 ✗ | 33 ✗ | hard-case | irrelevant-experience |
| p45 | test | irrelevant-experience-01 | Thực tập sinh Content Marketing | POOR | 2 người | 0,408 | 0 | 0 | 0 | 0 | cross-domain | irrelevant-experience |
| p46 | dev | sparse-profile-01 | Thực tập sinh Frontend Web | PARTIAL | 2 người | 0,716 | 80 ✗ | 96 ✗ | 86 ✗ | 88 ✗ | hard-case | sparse-profile, adjacent-field |
| p47 | dev | sparse-profile-01 | Thực tập sinh QA Automation | POOR | label | 0,419 | 5 | 0 | 3 | 3 | hard-case | sparse-profile, abbreviated-jd |
| p48 | dev | keyword-stuffing-01 | Thực tập sinh Backend Node TypeScript | PARTIAL | 2 người | 0,514 | 87 ✗ | 25 ✗ | 63 | 57 | hard-case | keyword-stuffing |
| p49 | dev | keyword-stuffing-01 | Thực tập sinh Frontend Product | PARTIAL | 2 người | 0,584 | 78 ✗ | 49 | 70 ✗ | 67 | hard-case | keyword-stuffing |
| p50 | dev | career-switch-01 | Thực tập sinh Data & AI | PARTIAL | 2 người | 0,611 | 86 ✗ | 59 | 77 ✗ | 75 ✗ | hard-case | career-switch |
| p51 | test | career-switch-01 | Thực tập sinh Digital Marketing | PARTIAL | label | 0,609 | 51 | 58 | 53 | 53 | same-domain | career-switch |
| p52 | test | language-01 | Thực tập sinh Content Marketing | PARTIAL | label | 0,402 | 47 | 0 ✗ | 29 ✗ | 24 ✗ | adjacent | — |
| p53 | test | language-01 | Thực tập sinh Digital Marketing | POOR | 2 người | 0,365 | 7 | 0 | 4 | 3 | adjacent | — |
| p54 | test | language-01 | Thực tập sinh Thiết kế UI | POOR | 2 người | 0,332 | 7 | 0 | 4 | 3 | cross-domain | — |
| p55 | test | logistics-01 | Thực tập sinh Kế toán | POOR | 2 người | 0,552 | 47 ✗ | 38 | 43 ✗ | 42 ✗ | adjacent | — |
| p56 | test | logistics-01 | Thực tập sinh Digital Marketing | POOR | 2 người | 0,379 | 18 | 0 | 11 | 10 | cross-domain | — |
| p57 | dev | it-adjacent-01 | Thực tập sinh Frontend Web | GOOD | label | 0,620 | 87 | 62 ✗ | 77 | 75 | hard-case | adjacent-field |
| p58 | dev | it-adjacent-01 | Thực tập sinh Backend Node TypeScript | PARTIAL | label | 0,469 | 40 | 9 ✗ | 28 ✗ | 25 ✗ | adjacent | adjacent-field |
| p59 | dev | backend-sql-03 | Thực tập sinh Backend Node TypeScript | PARTIAL | label | 0,544 | 47 | 35 ✗ | 42 | 41 | same-domain | — |
| p60 | dev | backend-sql-03 | Thực tập sinh QA Automation | POOR | label | 0,433 | 5 | 0 | 3 | 3 | adjacent | abbreviated-jd |
| p61 | test | communication-02 | Thực tập sinh Content Marketing | GOOD | label | 0,586 | 87 | 50 ✗ | 73 | 69 ✗ | same-domain | — |
| p62 | test | communication-02 | Thực tập sinh Thiết kế UI | POOR | 2 người | 0,380 | 7 | 0 | 4 | 3 | adjacent | — |
| p63 | dev | backend-sql-03 | Thực tập sinh Java Backend | PARTIAL | label | 0,479 | 7 ✗ | 12 ✗ | 9 ✗ | 9 ✗ | same-domain | — |
| p64 | dev | it-adjacent-01 | Thực tập sinh Java Backend | POOR | 2 người | 0,460 | 13 | 6 | 10 | 10 | adjacent | adjacent-field |

## Hạn chế

- Cỡ mẫu nhỏ (vài chục cặp, tập test vài tin): chênh lệch vài phần trăm giữa các cấu hình có thể chỉ là nhiễu.
- Dữ liệu demo do LLM sinh theo prompt có ràng buộc, có thể "sạch" và đồng đều hơn hồ sơ thật.
- Nhãn chủ quan; người thiết kế fixture cũng là người gán nhãn. Nhãn không tham chiếu điểm hệ thống (xem `labeling-guide.md`).
