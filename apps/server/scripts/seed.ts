import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const majors = [
  "Công nghệ thông tin",
  "Kỹ thuật phần mềm",
  "Khoa học máy tính",
  "Quản trị kinh doanh",
  "Marketing",
  "Kế toán",
  "Tài chính - Ngân hàng",
  "Thiết kế đồ họa",
];

const universities = [
  "Đại học Bách khoa Hà Nội",
  "Đại học Bách khoa TP.HCM",
  "Đại học Công nghệ - ĐHQGHN",
  "Đại học Khoa học Tự nhiên - ĐHQG-HCM",
  "Đại học Kinh tế Quốc dân",
  "Đại học FPT",
  "Đại học Ngoại thương",
];

const industries = [
  "Công nghệ thông tin",
  "Tài chính - Ngân hàng",
  "Thương mại điện tử",
  "Giáo dục",
  "Marketing & Truyền thông",
  "Sản xuất",
];

const cities = ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Cần Thơ", "Hải Phòng"];

const companyTypes = ["Startup", "Doanh nghiệp vừa và nhỏ", "Tập đoàn", "Công ty nước ngoài", "Agency"];

const skills = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Java",
  "SQL",
  "Figma",
  "Giao tiếp",
  "Quản lý thời gian",
];

// Phase 5 — Subscription & Payment. Giá VND cụ thể là số mẫu, chủ dự án tự
// điều chỉnh lúc seed thật (xem docs/06-backend/phase-05-subscription-payment/PLAN.md).
const paymentMethods: { displayName: string; processorType: "VNPAY" | "MOMO" }[] = [
  { displayName: "VNPay", processorType: "VNPAY" },
  { displayName: "Momo", processorType: "MOMO" },
];

const subscriptionPlans = [
  { name: "Cơ bản", description: "Phù hợp doanh nghiệp mới bắt đầu tuyển dụng", jobPostQuota: 5, durationDays: 30, price: 299000 },
  { name: "Tiêu chuẩn", description: "Tuyển dụng thường xuyên, nhiều vị trí", jobPostQuota: 20, durationDays: 30, price: 799000 },
  { name: "Doanh nghiệp", description: "Tuyển dụng quy mô lớn, không giới hạn theo tháng", jobPostQuota: 100, durationDays: 90, price: 1999000 },
];

async function seedCatalog<T>(name: string, values: T[], upsert: (value: T) => Promise<unknown>) {
  for (const value of values) {
    await upsert(value);
  }
  console.log(`Seeded ${values.length} ${name}`);
}

async function main() {
  await seedCatalog("majors", majors, (name) =>
    prisma.major.upsert({ where: { name }, update: {}, create: { name } }),
  );
  await seedCatalog("universities", universities, (name) =>
    prisma.university.upsert({ where: { name }, update: {}, create: { name } }),
  );
  await seedCatalog("industries", industries, (name) =>
    prisma.industry.upsert({ where: { name }, update: {}, create: { name } }),
  );
  await seedCatalog("cities", cities, (name) =>
    prisma.city.upsert({ where: { name }, update: {}, create: { name } }),
  );
  await seedCatalog("company types", companyTypes, (name) =>
    prisma.companyType.upsert({ where: { name }, update: {}, create: { name } }),
  );
  await seedCatalog("skills", skills, (name) =>
    prisma.skill.upsert({ where: { name }, update: {}, create: { name } }),
  );
  await seedCatalog("payment methods", paymentMethods, (item) =>
    prisma.paymentMethod.upsert({
      where: { displayName: item.displayName },
      update: {},
      create: { displayName: item.displayName, processorType: item.processorType, isAvailable: true },
    }),
  );
  await seedCatalog("subscription plans", subscriptionPlans, (item) =>
    prisma.subscriptionPlan.upsert({ where: { name: item.name }, update: {}, create: item }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
