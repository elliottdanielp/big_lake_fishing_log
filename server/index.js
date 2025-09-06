const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { parseRealtime2, parseNdbcRssFallback } = require('./ndbcParser');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('BLFL proxy running. Use /api/ndbc/:station');
});

// Fetch and normalize NDBC station data. Tries realtime2 text feed first, then RSS.
app.get('/api/ndbc/:station', async (req, res) => {
  const station = (req.params.station || '').toLowerCase();
  if (!station) return res.status(400).json({ error: 'station required' });

  const results = { station };

  // Try realtime2 text feed
  try {
    const rtUrl = `https://www.ndbc.noaa.gov/data/realtime2/${station}.txt`;
    const r = await fetch(rtUrl, { timeout: 10000 });
    if (r.ok) {
      const txt = await r.text();
      const parsed = parseRealtime2(txt);
      if (parsed) {
        results.source = 'realtime2';
        results.parsed = parsed;
        return res.json(results);
      }
    }
  } catch (err) {
    // continue to fallback
    console.warn('realtime2 fetch error', err && err.message);
  }

  // Fallback: try RSS
  try {
    const rssUrl = `https://www.ndbc.noaa.gov/data/latest_obs/${station}.rss`;
    const r2 = await fetch(rssUrl, { timeout: 10000 });
    if (r2.ok) {
      const rss = await r2.text();
      const parsed = parseNdbcRssFallback(rss);
      if (parsed) {
        results.source = 'rss';
        results.parsed = parsed;
        return res.json(results);
      }
    }
  } catch (err) {
    console.warn('rss fetch error', err && err.message);
  }

  res.status(502).json({ error: 'no data available for station', station });
});

const PORT = process.env.PORT || 3917;
app.listen(PORT, () => console.log(`BLFL proxy listening on port ${PORT}`));
