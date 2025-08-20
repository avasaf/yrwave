# BarentsWatch Wave Forecast Proxy

This lightweight Node.js server forwards widget requests to the BarentsWatch
`/v2/geodata/waveforecast/fairway` endpoint. It appends the required token and
returns the response with CORS headers so it can be called from the browser.

## Usage

1. Ensure you are running Node.js 18 or newer.
2. Export your BarentsWatch token as an environment variable:
   ```bash
   export BARENTSWATCH_TOKEN=your_token_here
   ```
3. Start the proxy:
   ```bash
   node server.js
   ```
4. Point the widget's `sourceUrl` to `http://localhost:3000/v2/geodata/waveforecast/fairway`.

The proxy listens on port `3000` by default. Use the `PORT` environment variable to change it.
