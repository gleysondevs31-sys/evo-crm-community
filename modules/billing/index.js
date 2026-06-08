const plans = [
  { id: 'starter', name: 'Starter', price: 297, limits: { users: 5, whatsappNumbers: 1, aiCredits: 1000 } },
  { id: 'growth', name: 'Growth', price: 697, limits: { users: 25, whatsappNumbers: 5, aiCredits: 10000 } },
  { id: 'scale', name: 'Scale', price: 1497, limits: { users: 100, whatsappNumbers: 20, aiCredits: 50000 } },
  { id: 'enterprise', name: 'Enterprise', price: null, limits: { users: 'custom', whatsappNumbers: 'custom', aiCredits: 'custom' } },
];

function createBillingModule() {
  return {
    plans: () => plans,
    currentSubscription(company) {
      return { companyId: company.id, plan: company.plan || 'growth', status: 'active', nextInvoiceAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20).toISOString() };
    },
  };
}

module.exports = { createBillingModule, plans };
