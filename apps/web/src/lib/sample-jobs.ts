// Dữ liệu tĩnh mẫu cho section "Tin mới trong tuần" ở trang chủ Candidate —
// Job Post API chưa có tới Phase 5 (xem AD-3). Khi Phase 5 xong, thay
// SAMPLE_JOBS bằng kết quả từ API thật, giữ nguyên layout gọi JobCard.
export interface SampleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  tags: string[];
  isNew?: boolean;
}

export const SAMPLE_JOBS: SampleJob[] = [
  {
    id: "1",
    title: "Thực tập sinh Frontend",
    company: "Vietnix Technology",
    location: "Hà Nội",
    salary: "4 – 6 triệu / tháng",
    tags: ["React", "Toàn thời gian", "3 tháng"],
    isNew: true,
  },
  {
    id: "2",
    title: "Thực tập sinh Phân tích dữ liệu",
    company: "DataCraft Việt Nam",
    location: "TP. Hồ Chí Minh",
    salary: "3 – 5 triệu / tháng",
    tags: ["SQL", "Bán thời gian"],
    isNew: true,
  },
  {
    id: "3",
    title: "Thực tập sinh Marketing",
    company: "BrightWave Media",
    location: "Đà Nẵng",
    salary: "3 – 4 triệu / tháng",
    tags: ["Content", "Toàn thời gian"],
  },
  {
    id: "4",
    title: "Thực tập sinh Backend",
    company: "Vietnix Technology",
    location: "Hà Nội",
    salary: "4 – 6 triệu / tháng",
    tags: ["Node.js", "3 tháng"],
  },
];
