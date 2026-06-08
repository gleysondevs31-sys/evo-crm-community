const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const port = Number(process.env.WEB_PORT || process.env.PORT || 5173);
const apiBaseUrl = process.env.ATTO_API_BASE_URL || 'http://localhost:10000';
const html = readFileSync(join(__dirname, 'index.html'), 'utf8').replaceAll("fetch('", `fetch('${apiBaseUrl}`);

http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, '0.0.0.0', () => {
  console.log(`ATTO FLOW web listening on ${port}`);
});
