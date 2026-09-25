import type { CandidateFullProfile } from "@/hooks/useCvs";

export interface CvBuilderData {
  personal: {
    fullName: string;
    headline: string;
    email: string;
    phone: string;
    city: string;
    avatarUrl: string;
  };
  summary: string;
  experiences: {
    id: string;
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
  }[];
  educations: {
    id: string;
    school: string;
    major: string;
    degree: string;
    startYear: number;
    endYear: number;
    isCurrent: boolean;
    description: string;
  }[];
  projects: {
    id: string;
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    isWorkingOn: boolean;
  }[];
  skills: {
    id: string;
    name: string;
    yearsOfExperience?: number;
  }[];
  certificates: {
    id: string;
    name: string;
    issuer: string;
    date: string;
  }[];
  sectionOrder: string[];
}

export interface CvBuilderConfig {
  primaryColor: string;
  fontFamily: string;
}

export const DEFAULT_SECTION_ORDER = [
  "personal",
  "summary",
  "experiences",
  "educations",
  "projects",
  "skills",
  "certificates",
];

export const DUMMY_CV_DATA: CvBuilderData = {
  personal: {
    fullName: "Nguyễn Văn A",
    headline: "Software Engineer",
    email: "nguyenvana@gmail.com",
    phone: "0901234567",
    city: "Hồ Chí Minh",
    avatarUrl: "",
  },
  summary: "Lập trình viên Software Engineer với 2 năm kinh nghiệm phát triển ứng dụng web bằng React và Node.js. Đam mê học hỏi công nghệ mới và tối ưu hóa hiệu suất ứng dụng.",
  experiences: [
    {
      id: "exp1",
      company: "Tech Solutions VN",
      position: "Frontend Developer",
      startDate: "2024-01-01T00:00:00.000Z",
      endDate: "",
      isCurrent: true,
      description: "- Phát triển giao diện người dùng với React.js và Next.js.\n- Tối ưu hóa hiệu năng trang web, giảm 30% thời gian tải trang.\n- Làm việc chặt chẽ với đội ngũ thiết kế UI/UX.",
    }
  ],
  educations: [
    {
      id: "edu1",
      school: "Đại học Bách Khoa TP.HCM",
      major: "Khoa học Máy tính",
      degree: "Cử nhân",
      startYear: 2019,
      endYear: 2023,
      isCurrent: false,
      description: "Tốt nghiệp loại Giỏi, GPA 3.8/4.0",
    }
  ],
  projects: [
    {
      id: "proj1",
      name: "Smart E-commerce Platform",
      description: "Xây dựng hệ thống thương mại điện tử với tính năng gợi ý sản phẩm dựa trên AI.",
      startDate: "2023-05-01T00:00:00.000Z",
      endDate: "2023-12-01T00:00:00.000Z",
      isWorkingOn: false,
    }
  ],
  skills: [
    { id: "sk1", name: "ReactJS", yearsOfExperience: 2 },
    { id: "sk2", name: "Node.js", yearsOfExperience: 2 },
    { id: "sk3", name: "TypeScript", yearsOfExperience: 2 },
  ],
  certificates: [
    { id: "cert1", name: "AWS Certified Developer", issuer: "Amazon Web Services", date: "2024-02-15T00:00:00.000Z" }
  ],
  sectionOrder: [...DEFAULT_SECTION_ORDER],
};

export function mapProfileToCvBuilderData(profile: CandidateFullProfile | null): CvBuilderData {
  if (!profile) {
    return {
      personal: {
        fullName: "",
        headline: "",
        email: "",
        phone: "",
        city: "",
        avatarUrl: "",
      },
      summary: "",
      experiences: [],
      educations: [],
      projects: [],
      skills: [],
      certificates: [],
      sectionOrder: [...DEFAULT_SECTION_ORDER],
    };
  }

  return {
    personal: {
      fullName: profile.fullName || "",
      headline: profile.headline || "",
      email: "", // User email is not directly in CandidateFullProfile, will be added if possible
      phone: profile.phone || "",
      city: profile.city?.name || "",
      avatarUrl: profile.avatarUrl || "",
    },
    summary: profile.bio || "",
    experiences: (profile.workExperiences || []).map((exp) => ({
      id: crypto.randomUUID(),
      company: exp.company || "",
      position: exp.position || "",
      startDate: exp.startDate || "",
      endDate: exp.endDate || "",
      isCurrent: !!exp.isCurrent,
      description: exp.description || "",
    })),
    educations: (profile.educations || []).map((edu) => ({
      id: crypto.randomUUID(),
      school: edu.university?.name || "",
      major: edu.major?.name || "",
      degree: edu.degree || "",
      startYear: edu.startYear || new Date().getFullYear(),
      endYear: edu.endYear || new Date().getFullYear(),
      isCurrent: !!edu.isCurrent,
      description: edu.description || "",
    })),
    projects: (profile.projects || []).map((proj) => ({
      id: crypto.randomUUID(),
      name: proj.name || "",
      description: proj.description || "",
      startDate: proj.startDate || "",
      endDate: proj.endDate || "",
      isWorkingOn: !!proj.isWorkingOn,
    })),
    skills: (profile.skills || []).map((sk) => ({
      id: crypto.randomUUID(),
      name: sk.skill.name || "",
      yearsOfExperience: sk.yearsOfExperience || 0,
    })),
    certificates: (profile.certificates || []).map((cert) => ({
      id: crypto.randomUUID(),
      name: cert.name || "",
      issuer: cert.issuer || "",
      date: cert.issueDate || "",
    })),
    sectionOrder: [...DEFAULT_SECTION_ORDER],
  };
}
