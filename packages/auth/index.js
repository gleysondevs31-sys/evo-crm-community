const ROLE_LEVELS = {
  broker: 10,
  manager: 20,
  superintendent: 30,
  director: 40,
  company_admin: 50,
  owner: 100,
};

function getRequestContext(req) {
  const companyId = req.headers['x-company-id'] || process.env.ATTO_DEFAULT_COMPANY_ID || 'company_atto_demo';
  const userId = req.headers['x-user-id'] || process.env.ATTO_DEFAULT_USER_ID || 'user_owner_demo';
  const role = req.headers['x-role'] || 'owner';

  return {
    companyId,
    userId,
    role,
    user: { id: userId, companyId, role, name: 'API User' },
    can(requiredRole) {
      return (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[requiredRole] || 0);
    },
  };
}

function filterLeadsForContext(leads, context) {
  if (context.can('manager')) return leads;
  return leads.filter((lead) => lead.assignedUserId === context.userId);
}

module.exports = { getRequestContext, filterLeadsForContext, ROLE_LEVELS };
