function createDisparosEventBus() {
  const listeners = new Set();
  const recent = [];

  function publish(event) {
    const entry = {
      id: `evt_${Date.now()}_${recent.length + 1}`,
      type: event.type,
      companyId: event.companyId,
      connectionId: event.connectionId || null,
      campaignId: event.campaignId || null,
      payload: event.payload || {},
      timestamp: event.timestamp || new Date().toISOString(),
    };
    recent.push(entry);
    if (recent.length > 250) recent.shift();
    for (const listener of listeners) listener(entry);
    return entry;
  }

  return {
    publish,
    recent(companyId) {
      return recent.filter((event) => event.companyId === companyId);
    },
    subscribe(companyId, listener) {
      const wrapped = (event) => {
        if (event.companyId === companyId) listener(event);
      };
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
  };
}

module.exports = { createDisparosEventBus };
