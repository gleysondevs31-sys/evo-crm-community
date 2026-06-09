const { BaseRepository } = require('./base.repository');
class AuditLogRepository extends BaseRepository { constructor(prisma) { super(prisma, 'auditLog'); } }
module.exports = { AuditLogRepository };
