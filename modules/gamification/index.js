const POINTS = {
  'lead.created': 5,
  'conversation.effective': 10,
  scheduled: 20,
  visit: 30,
  sale: 100,
};

function createGamificationModule({ database }) {
  return {
    award(context, userId, type, sourceId) {
      return database.addScoreEvent({
        companyId: context.companyId,
        userId,
        type,
        sourceId,
        points: POINTS[type] || 1,
      });
    },
    ranking(context) {
      const totals = new Map();
      for (const event of database.listScoreEvents(context.companyId)) {
        totals.set(event.userId, (totals.get(event.userId) || 0) + event.points);
      }
      return [...totals.entries()]
        .map(([userId, points]) => ({ userId, points }))
        .sort((a, b) => b.points - a.points);
    },
  };
}

module.exports = { createGamificationModule };
