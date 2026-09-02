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

async function seedCatalog(name: string, values: string[], upsert: (name: string) => Promise<unknown>) {
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
