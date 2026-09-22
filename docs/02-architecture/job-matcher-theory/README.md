# Cơ sở lý thuyết — Job Matcher (GĐ1 + GĐ2)

Tài liệu giải thích **vì sao** và **bằng công thức nào** module `apps/server/src/modules/job-matching/` chấm điểm mức phù hợp giữa hồ sơ ứng viên và tin tuyển dụng. Không mô tả lịch sử dự án; kế hoạch/quyết định nằm ở `docs/06-backend/job-matcher-phase1|2/PLAN.md` và `docs/02-architecture/ARCHITECTURE_DECISIONS.md` (mục Job Matcher).

| File | Nội dung | Giai đoạn |
|---|---|---|
| [`01-rule-based-scoring.md`](01-rule-based-scoring.md) | Chấm điểm theo luật: tổng có trọng số, chia lại trọng số khi thiếu dữ liệu, độ tin cậy | GĐ1 |
| [`02-embedding-and-hybrid.md`](02-embedding-and-hybrid.md) | Embedding câu, cosine, chuẩn hoá `lo/hi`, kết hợp hybrid, bộ nhớ đệm theo hash | GĐ2 |
| [`03-evaluation.md`](03-evaluation.md) | Nhãn, tách dev/test, Spearman ρ, accuracy, FP/FN, NDCG@3, Cohen's κ, quy tắc quyết định | Bước 6 GĐ2 |

## Pipeline tổng thể

```text
                ┌────────────────────────── Dữ liệu đầu vào ──────────────────────────┐
                │  Hồ sơ ứng viên (kỹ năng, số năm, headline, học vấn, dự án …)        │
                │  Tin tuyển dụng (kỹ năng REQUIRED/PREFERRED, số năm tối thiểu, mô tả) │
                └───────────────┬───────────────────────────────────┬─────────────────┘
                                │                                   │
                 Nhánh LUẬT (GĐ1, mọi chế độ)          Nhánh NGỮ NGHĨA (GĐ2, chỉ khi hybrid)
                                │                                   │
        tỉ lệ kỹ năng bắt buộc / ưu tiên            buildCandidateMatchText / buildJobMatchText
        tỉ lệ kinh nghiệm min(1, năm/yêu cầu)                       │
                                │                        hash = sha256(template|model|text)
                                │                                   │
                                │                    có vector khớp hash? ── chưa ─► model embed
                                │                                   │                (384 chiều, chuẩn hoá)
                                │                          pgvector: cosine = 1 − (a <=> b)
                                │                                   │
                                │                    semantic = clamp((cosine − lo)/(hi − lo), 0, 1)
                                └───────────────┬───────────────────┘
                                                ▼
                     ScoringJobMatcher: bỏ thành phần không áp dụng, chia lại trọng số
                     score = round(100 · Σ wᵢ' · sᵢ),  wᵢ' = wᵢ / Σ_{j áp dụng} wⱼ
                                                ▼
                   MatchResult { score, status, confidence, thành phần, bằng chứng, weightsVersion }
                                                ▼
        JobMatchingService: JOB_MATCHER_MODE = rule | hybrid;  thiếu cosine ⇒ rơi về rule-v1
```

Quy trình đánh giá (tách riêng, xem `03-evaluation.md`):

```text
fixture ứng viên/tin ─► seed-match-demo ─► gán nhãn (người) ─► eval-job-matching ─► eval-results.md
                                                                   │
                       dev: hiệu chỉnh lo/hi, ngưỡng, lưới trọng số ┤
                       test: chỉ báo cáo                            └─► quy tắc quyết định ─► cấu hình mặc định
```

## Nguyên tắc thiết kế xuyên suốt

1. **Một hàm chấm điểm thuần** cho mọi cấu hình; `rule`, `embedding-only`, `hybrid` chỉ là ba bảng trọng số (`job-matching.config.ts`). Nhờ vậy so sánh giữa các cấu hình là so sánh công bằng trên cùng code.
2. **Unknown ≠ 0:** thiếu dữ liệu làm giảm độ tin cậy hoặc loại thành phần khỏi phép tính, không tự trừ điểm.
3. **Điểm là gợi ý** kèm bằng chứng (kỹ năng khớp/thiếu, thành phần, phiên bản trọng số), không tự quyết định tuyển/loại.
4. **Mọi tham số chỉnh trên dev**, test chỉ để báo cáo; quy tắc quyết định chốt trước khi có số.

## Tài liệu tham khảo

Đã kiểm tra DOI/arXiv còn truy cập được (2026-09-22). Trích dẫn trong các file theo `[Tác giả năm]`.

**Biểu diễn văn bản và embedding**

- [Harris1954] Harris, Z. S. (1954). *Distributional Structure*. Word, 10(2–3). https://doi.org/10.1080/00437956.1954.11659520
- [Salton1975] Salton, G., Wong, A., Yang, C. S. (1975). *A vector space model for automatic indexing*. CACM 18(11). https://doi.org/10.1145/361219.361220
- [Mikolov2013] Mikolov, T. et al. (2013). *Efficient Estimation of Word Representations in Vector Space*. https://arxiv.org/abs/1301.3781
- [Devlin2019] Devlin, J. et al. (2019). *BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding*. https://arxiv.org/abs/1810.04805
- [Reimers2019] Reimers, N., Gurevych, I. (2019). *Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks*. EMNLP. https://arxiv.org/abs/1908.10084 · https://aclanthology.org/D19-1410/
- [Reimers2020] Reimers, N., Gurevych, I. (2020). *Making Monolingual Sentence Embeddings Multilingual using Knowledge Distillation*. EMNLP. https://arxiv.org/abs/2004.09813 · https://aclanthology.org/2020.emnlp-main.365/
- [Wang2020] Wang, W. et al. (2020). *MiniLM: Deep Self-Attention Distillation for Task-Agnostic Compression of Pre-Trained Transformers*. https://arxiv.org/abs/2002.10957
- [Ethayarajh2019] Ethayarajh, K. (2019). *How Contextual are Contextualized Word Representations?* EMNLP. https://arxiv.org/abs/1909.00512 · https://aclanthology.org/D19-1006/
- Model đang dùng: https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (bản ONNX cho JS: https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2)
- pgvector: https://github.com/pgvector/pgvector

**Gợi ý/khớp việc làm**

- [Furnas1987] Furnas, G. W. et al. (1987). *The vocabulary problem in human-system communication*. CACM 30(11). https://doi.org/10.1145/32206.32212
- [Lops2011] Lops, P., de Gemmis, M., Semeraro, G. (2011). *Content-based Recommender Systems: State of the Art and Trends*. In *Recommender Systems Handbook*. https://doi.org/10.1007/978-0-387-85820-3_3
- [Burke2002] Burke, R. (2002). *Hybrid Recommender Systems: Survey and Experiments*. UMUAI 12(4). https://doi.org/10.1023/A:1021240730564
- [deRuijt2021] de Ruijt, C., Bhulai, S. (2021). *Job Recommender Systems: A Review*. https://arxiv.org/abs/2111.13576
- [Mashayekhi2022] Mashayekhi, Y. et al. (2022). *A challenge-based survey of e-recruitment recommendation systems*. https://arxiv.org/abs/2209.05112

**Đánh giá**

- [Spearman1904] Spearman, C. (1904). *The Proof and Measurement of Association between Two Things*. Am. J. Psychology 15(1). https://doi.org/10.2307/1412159
- [Jarvelin2002] Järvelin, K., Kekäläinen, J. (2002). *Cumulated gain-based evaluation of IR techniques*. ACM TOIS 20(4). https://doi.org/10.1145/582415.582418
- [McSherry2008] McSherry, F., Najork, M. (2008). *Computing Information Retrieval Performance Measures Efficiently in the Presence of Tied Scores*. ECIR. https://doi.org/10.1007/978-3-540-78646-7_38
- [Cohen1960] Cohen, J. (1960). *A Coefficient of Agreement for Nominal Scales*. Educ. Psychol. Measurement 20(1). https://doi.org/10.1177/001316446002000104
- [Landis1977] Landis, J. R., Koch, G. G. (1977). *The Measurement of Observer Agreement for Categorical Data*. Biometrics 33(1). https://doi.org/10.2307/2529310

**Không có nguồn học thuật trực tiếp** (là quyết định thiết kế của dự án, đã nói rõ ở từng file): chọn `lo/hi` bằng trung vị cosine của cặp POOR/GOOD, lưới trọng số semantic {0,2; 0,3; 0,4}, mẫu văn bản embed, quy tắc quyết định đổi mặc định sang hybrid.
