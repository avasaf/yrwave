const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const TARGET = 'https://www.barentswatch.no/bwapi/v2/geodata/waveforecast/fairway';

const server = http.createServer(async (req, res) => {
  // Only handle GET requests to the waveforecast endpoint
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.end('Method Not Allowed');
  }

  const incomingUrl = new URL(req.url, `http://${req.headers.host}`);
  if (incomingUrl.pathname !== '/v2/geodata/waveforecast/fairway') {
    res.statusCode = 404;
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.end('Not Found');
  }

  const targetUrl = TARGET + incomingUrl.search;

  try {
    const upstream = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${process.env.BARENTSWATCH_TOKEN || ''}` }
    });
    const body = await upstream.text();

    res.statusCode = upstream.status;
    res.setHeader('Access-Control-Allow-Origin', '*');
    const type = upstream.headers.get('content-type');
    if (type) res.setHeader('Content-Type', type);
    res.end(body);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
