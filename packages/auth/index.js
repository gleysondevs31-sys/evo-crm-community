const ROLE_LEVELS = {
  broker: 10,
  manager: 20,
  superintendent: 30,
  director: 40,
  company_admin: 50,
  owner: 100,
};

function getRequestContext(req, database) {
  const companyId = req.headers['x-company-id'] || process.env.ATTO_DEFAULT_COMPANY_ID || 'company_atto_demo';
  const userId = req.headers['x-user-id'] || process.env.ATTO_DEFAULT_USER_ID || 'user_owner_demo';
  const requestedRole = req.headers['x-role'];
  const user = database.getUser(companyId, userId) || { id: userId, companyId, role: requestedRole || 'owner', name: 'API User' };
  const role = requestedRole || user.role || 'broker';

  return {
    companyId,
    userId,
    role,
    user,
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
