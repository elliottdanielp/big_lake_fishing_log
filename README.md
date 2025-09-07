# Big Lake Fishing Log

PWA-ready single-file fishing log app. Use GitHub Pages to host the site and add to Home Screen on iPhone.

Quick PWA deployment notes:

- Add `icon-192.png` and `icon-512.png` to the repo root (icons for Home screen). Use PNGs.
- `manifest.json` is included; the service worker (`service-worker.js`) precaches the app shell.
- For GitHub Pages project sites, the service worker is registered using a relative path so scope is correct.

To test locally:

```bash
python -m http.server 8000
# open http://localhost:8000/index.html
```

Export & hosting notes
--------------------------------

This app is local-only by design. It stores trip data in your browser (localStorage + IndexedDB for photos) and provides three built-in export options:

- CSV export: download a CSV file you can open in Excel or Numbers.
- JSON export: a full JSON dump of the selected trip.
- Album export: a small HTML file containing photos and entries for sharing or archival.

To host the app (optional):

- Use GitHub Pages or any static host. To test locally, run:

```bash
python -m http.server 8000
# open http://localhost:8000/index.html
```

Notes:
- There is no built-in cloud sync. If you want backups, export CSV/JSON and store them where you choose.
- Photos remain stored in your browser's IndexedDB unless you export them.

GitHub Pages & sample JSON
--------------------------

You can publish the repo with GitHub Pages and host small JSON files (for marine/station data) that the app can fetch.

1. Push this repository to GitHub under your account (e.g. `username/big_lake_fishing_log`).
2. In the repository on GitHub go to Settings → Pages.
3. Under "Source" select the `main` branch and folder `/ (root)` and click Save.
4. The site will be available at `https://<your-username>.github.io/big_lake_fishing_log/`.

Examples of JSON URLs you can use in Settings → Station JSON Template:

- Raw file: `https://raw.githubusercontent.com/<your-username>/big_lake_fishing_log/main/sample-ndbc.json`
- Pages file: `https://<your-username>.github.io/big_lake_fishing_log/sample-ndbc.json`

Notes about NDBC endpoints:
- NDBC files like `https://www.ndbc.noaa.gov/data/realtime2/45161.spec` or `.../45161.ocean` are raw station feeds but often block direct browser requests (CORS).
- For reliable live data, either host normalized JSON on GitHub Pages or deploy a tiny serverless proxy (Cloudflare Worker) that fetches NDBC and returns JSON with CORS headers.

If you'd like, I can populate `stations.json` with actual NDBC station IDs in the Holland–Muskegon area and provide a Cloudflare Worker script to proxy/normalize NDBC feeds.

