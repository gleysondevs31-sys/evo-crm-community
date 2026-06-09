const { BaseRepository } = require('./base.repository');
class ContactListRepository extends BaseRepository { constructor(prisma) { super(prisma, 'contactList'); } }
module.exports = { ContactListRepository };
