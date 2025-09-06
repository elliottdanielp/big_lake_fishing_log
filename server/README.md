BLFL proxy
===============

This is a minimal Node/Express proxy used to fetch and normalize NDBC station data.
It attempts the NDBC realtime2 text feed first, then falls back to the RSS feed.

Quick start:

```bash
cd server
npm install
npm start
```

The server will run on port 3917 by default.

Example:

- Fetch station MKGM4:
  http://localhost:3917/api/ndbc/mkgm4

Notes:
- This proxy is intentionally small and permissive (CORS enabled). For production, lock down origins, add rate-limiting and caching.
