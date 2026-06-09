const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companyId = 'company_atto_demo';
  const userId = 'user_owner_demo';
  const connectionId = 'wa_demo';
  const listId = 'list_demo';
  const contactId = 'contact_demo';
  const templateId = 'tpl_demo';
  const campaignId = 'camp_demo';
  const campaignContactId = 'cc_demo';

  await prisma.company.upsert({
    where: { id: companyId },
    update: { status: 'active' },
    create: { id: companyId, name: 'ATTO Demo Imobiliária', slug: 'atto-demo', status: 'active' },
  });
  await prisma.user.upsert({
    where: { id: userId },
    update: { status: 'active' },
    create: { id: userId, companyId, name: 'Owner Demo', email: 'owner@attoflow.local', role: 'owner', status: 'active' },
  });
  await prisma.whatsAppConnection.upsert({
    where: { id: connectionId },
    update: { status: 'connected' },
    create: {
      id: connectionId,
      companyId,
      name: 'Conexão Demo',
      phoneNumber: '5511999990000',
      status: 'connected',
      qrCode: null,
      lastHeartbeatAt: new Date(),
      sessionPath: `storage/whatsapp-sessions/${companyId}/${connectionId}`,
      dailyLimit: 500,
      hourlyLimit: 60,
      delayMinMs: 1000,
      delayMaxMs: 3000,
    },
  });
  await prisma.contactList.upsert({
    where: { id: listId },
    update: {},
    create: { id: listId, companyId, name: 'Lista Demo', source: 'seed', totalContacts: 1, validContacts: 1 },
  });
  await prisma.contact.upsert({
    where: { id: contactId },
    update: { status: 'valid' },
    create: { id: contactId, companyId, listId, name: 'Maria Demo', phone: '5511988887777', rawPhone: '(11) 98888-7777', tags: ['demo'], customFields: { interesse: 'imóvel' }, origin: 'seed', status: 'valid' },
  });
  await prisma.messageTemplate.upsert({
    where: { id: templateId },
    update: {},
    create: { id: templateId, companyId, name: 'Template Demo', body: 'Olá {{nome}}, tudo bem?', variables: ['nome', 'telefone', 'empresa'] },
  });
  await prisma.campaign.upsert({
    where: { id: campaignId },
    update: {},
    create: { id: campaignId, companyId, connectionId, contactListId: listId, name: 'Campanha Demo', message: 'Olá {{nome}}, tudo bem?', status: 'draft', totalContacts: 1, totalPending: 1 },
  });
  await prisma.campaignContact.upsert({
    where: { companyId_campaignId_contactId: { companyId, campaignId, contactId } },
    update: {},
    create: { id: campaignContactId, companyId, campaignId, contactId, status: 'pending' },
  });
  await prisma.messageLog.create({
    data: { id: `log_seed_${Date.now()}`, companyId, campaignId, connectionId, contactId, type: 'seed.created', status: 'info', message: 'Seed ATTOZAP DISPAROS criado.', metadata: { seed: true } },
  });
}

main().finally(() => prisma.$disconnect());
