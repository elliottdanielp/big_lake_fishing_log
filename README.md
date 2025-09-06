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

