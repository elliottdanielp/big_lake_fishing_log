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

Sheets API & GitHub Pages setup
--------------------------------

1) Create a Google Cloud project and enable the Google Sheets API (and Drive API if you want photo uploads).
	- Go to https://console.cloud.google.com
	- Create/select a project
	- APIs & Services → Library → enable 'Google Sheets API' and 'Google Drive API' (optional)
2) Create credentials (OAuth 2.0 Client ID and API key):
	- APIs & Services → Credentials → Create Credentials → API key (copy it)
	- Create OAuth client ID → Web application. Add the origin(s) where you'll host the app (e.g., https://yourname.github.io) and http://localhost for testing.
	- Copy the Client ID value.
3) Locally add credentials without checking them in:
	- Copy `config.example.js` to `config.js` in the repo root.
	- Fill `CLIENT_ID` and `API_KEY` with values from step 2. `config.js` is in `.gitignore` and won't be committed.
4) Host on GitHub Pages:
	- Push the repo to GitHub and enable Pages (use the `main` branch and `/ (root)` folder).
	- Open your site (https://<your-username>.github.io/<repo-name>) and paste a Spreadsheet ID in the Export → Spreadsheet ID field.
5) Use the app on your iPhone:
	- Open the hosted URL in Safari, Sign In (Google), paste the Spreadsheet ID, and click Upload.

Notes:
- The app appends rows to `Sheet1` by default. Create or rename your sheet accordingly.
- Photos are saved locally; Sheets rows store a 'Y' if a photo exists. If you want photos uploaded to Drive and place URLs into the sheet, I can add that flow.
- For better privacy, you can create a dedicated Google account for the app and a sheet owned by that account.

