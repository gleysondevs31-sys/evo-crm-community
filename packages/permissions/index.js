const permissions = {
  owner: ['*'],
  company_admin: ['company:*', 'crm:*', 'attozap:*', 'reports:*', 'automation:*', 'billing:*'],
  director: ['crm:read', 'attozap:read', 'reports:*', 'team:read'],
  superintendent: ['crm:read', 'attozap:read', 'reports:team', 'team:read'],
  manager: ['crm:team', 'attozap:team', 'reports:team', 'automation:run'],
  broker: ['crm:own', 'attozap:own', 'tasks:own'],
};

function can(role, permission) {
  const allowed = permissions[role] || [];
  return allowed.includes('*') || allowed.includes(permission) || allowed.some((entry) => entry.endsWith(':*') && permission.startsWith(entry.slice(0, -1)));
}

module.exports = { permissions, can };
