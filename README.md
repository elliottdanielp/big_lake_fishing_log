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

