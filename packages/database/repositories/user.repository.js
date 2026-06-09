const { BaseRepository } = require('./base.repository');
class UserRepository extends BaseRepository { constructor(prisma) { super(prisma, 'user'); } }
module.exports = { UserRepository };
