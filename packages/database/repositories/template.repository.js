const { BaseRepository } = require('./base.repository');
class TemplateRepository extends BaseRepository { constructor(prisma) { super(prisma, 'messageTemplate'); } }
module.exports = { TemplateRepository };
