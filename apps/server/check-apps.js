const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const apps = await prisma.application.findMany({ take: 10 });
  console.log('Total applications:', apps.length);
  console.log(JSON.stringify(apps.map(a => ({ id: a.id, status: a.status, jobPostId: a.jobPostId, candidateId: a.candidateId })), null, 2));
  
  const employers = await prisma.employer.findMany({ take: 3, include: { user: { select: { email: true } }, company: { select: { id: true, name: true } } } });
  console.log('Employers:', JSON.stringify(employers.map(e => ({ userId: e.userId, companyId: e.companyId, email: e.user.email, company: e.company.name })), null, 2));
  
  if (apps.length > 0) {
    const jobPost = await prisma.jobPost.findUnique({ where: { id: apps[0].jobPostId }, include: { company: true } });
    console.log('JobPost company:', jobPost?.company?.id, jobPost?.company?.name);
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
