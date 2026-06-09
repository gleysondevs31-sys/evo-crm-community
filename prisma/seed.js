const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.company.upsert({ where: { id: 'company_atto_demo' }, update: {}, create: { id: 'company_atto_demo', name: 'ATTO Demo Imobiliária', slug: 'atto-demo' } });
  await prisma.user.upsert({ where: { id: 'user_owner_demo' }, update: {}, create: { id: 'user_owner_demo', companyId: 'company_atto_demo', name: 'Owner Demo', email: 'owner@attoflow.local', role: 'owner' } });
}

main().finally(() => prisma.$disconnect());
