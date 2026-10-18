-- Học vấn đại diện được tra theo candidateId cho từng dòng của danh sách Ứng viên, dashboard
-- và thẻ tìm ứng viên. Không có index thì mỗi dòng quét cả bảng educations: đo trên 100.000
-- dòng giả, khoảng 6 ms mỗi dòng, 120 ms trong 150 ms của một trang 20 hồ sơ.

-- CreateIndex
CREATE INDEX "educations_candidateId_idx" ON "educations"("candidateId");
