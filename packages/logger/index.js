function log(level, message, metadata = {}) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...metadata,
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

module.exports = {
  logger: {
    info: (message, metadata) => log('info', message, metadata),
    warn: (message, metadata) => log('warn', message, metadata),
    error: (message, metadata) => log('error', message, metadata),
  },
};
