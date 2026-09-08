# Hướng dẫn viết tài liệu kiến trúc frontend theo phase

Thư mục này chứa kiến trúc, component, system design cho **frontend** (`apps/web`), tổ chức theo phase — tương tự cách `docs/01-project/PROJECT_PHASES.md` + `docs/phases/` tổ chức cho backend, nhưng tách riêng vì nội dung/mối quan tâm của frontend khác backend (routing/layout theo actor, component tree, state management, design system...) thay vì Prisma schema/service/repository.

## Cấu trúc thư mục

```text
docs/05-frontend/
├── README.md              # File này — quy ước chung
├── FRONTEND_PHASES.md     # Roadmap tóm tắt các phase frontend (tương tự PROJECT_PHASES.md)
└── phases/
    └── phase-NN-slug/     # Tạo ngay trước khi triển khai phase đó, chứa PLAN.md
```

`FRONTEND_PHASES.md` chỉ giữ Goal/Main screens/Dependencies/DoD ở mức tóm tắt cho toàn bộ roadmap frontend, dễ scan. Kế hoạch chi tiết (đủ để bắt tay code — component tree, routing, state management...) đặt trong `phases/phase-NN-slug/PLAN.md`, tạo **ngay trước khi bắt đầu triển khai phase đó**, không tạo trước hàng loạt.

## Đánh số phase

Số phase (`NN`) đi song song với số phase backend trong `docs/01-project/PROJECT_PHASES.md` (`phase-02-identity-access` frontend ứng với Phase 2 Identity & Access backend...) để dễ đối chiếu dependency giữa BE/FE.

Khi phát sinh nhu cầu UI không được nêu rõ trong phase backend nào (vd. thiết lập Design System/UI kit, layout/routing khung chung theo actor trước khi có API cụ thể để gọi), được phép **chen thêm phase** bằng hậu tố chữ cái sau số phase backend gần nhất đứng trước, ví dụ: `phase-00a-design-system` (chen giữa Phase 0 và Phase 1), `phase-02a-slug` (chen giữa Phase 2 và Phase 3). Ghi rõ trong `FRONTEND_PHASES.md` phase chen thêm này nằm giữa hai phase nào và lý do.

## Đặt tên thư mục phase

`docs/05-frontend/phases/phase-NN-slug/` — `NN` theo quy tắc đánh số ở trên, `slug` là tên ngắn không dấu, viết thường, nối bằng `-`.

## Cấu trúc file `PLAN.md` trong một phase

Mỗi phase có ít nhất 1 file `PLAN.md` trong `phase-NN-slug/`, chia làm đúng 4 phần theo thứ tự sau (giữ khung 4 phần giống quy ước backend ở `docs/phases/README.md` để nhất quán, nhưng nội dung Phần 2 đặc thù cho frontend):

### Phần 1 — Công nghệ / package / kiến trúc frontend sử dụng

Package nào (kèm version nếu đã chốt), pattern áp dụng cho phase này (vd. Server Components vs Client Components, form handling, validation lib...), có thêm dependency mới nào không và lý do. Không lặp lại tech stack chung của dự án (đã có ở `PROJECT_OVERVIEW.md` §9) — chỉ ghi phần **đặc thù riêng của phase này**.

### Phần 2 — Kiến trúc & liên kết

Mô tả ở mức vừa đủ, gồm các mục con sau (bỏ mục nào không áp dụng cho phase):

- **Routing & layout theo actor** — route/segment nào trong `(public)/(auth)/(candidate)/(employer)/(admin)`, layout lồng nhau, middleware guard.
- **Component tree & tái sử dụng** — cây component chính của phase, phân biệt component dùng chung (shared) vs. component riêng theo actor, component nào tái dùng từ phase trước.
- **State management & data fetching** — state nào là server state (React Query/SWR...) vs. client state, cách gọi API backend tương ứng (endpoint nào, từ module backend nào).
- **UI states & design system** — loading/error/empty state xử lý ra sao, có dùng lại token/component nào từ design system chung không, responsive breakpoint cần lưu ý.

### Phần 3 — Các bước thực hiện

Danh sách các bước triển khai theo thứ tự hợp lý. Nếu phase quá dài/phức tạp, được phép chia nhỏ thành nhiều file trong cùng thư mục phase đó (vd. `PLAN.md` tổng quan + `01-routing.md`, `02-components.md`...) miễn là `PLAN.md` liệt kê rõ thứ tự và trỏ tới các file con.

### Phần 4 — Ghi chú của chủ dự án

Phần để trống, dành riêng cho chủ dự án tự ghi thêm trong quá trình triển khai. Claude Code không tự ý viết vào phần này trừ khi được yêu cầu trực tiếp.

## Nguyên tắc chung

- Chỉ tạo thư mục `phase-NN-slug/` khi thực sự chuẩn bị triển khai phase đó — không tạo trước hàng loạt cho cả roadmap.
- Không chép lại nội dung đã có sẵn ở `docs/02-architecture/PROJECT_STRUCTURE.md` §3 (cấu trúc `apps/web` tổng quan) hay `docs/04-api/API_CONVENTIONS.md` — trỏ link tới đó, chỉ ghi phần bổ sung/đặc thù của phase.
- Nếu trong lúc lên kế hoạch phát hiện cần sửa quyết định kiến trúc frontend đã chốt trước đó (vd. đổi thư viện state management), phải cập nhật lại tài liệu gốc (`docs/02-architecture/`), không chỉ sửa trong file phase.
