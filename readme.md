# Activity Tracker Monorepo

This repo is split into two workstreams:

- `extension/`: browser extension for tab activity, timing, idle detection, and local popup stats
- `platform/`: backend API and dashboard

## Current MVP status

Implemented:

- Current URL tracking
- Domain extraction
- Visit logging
- Time spent per site
- Tab switch handling
- Idle pause handling
- Local extension storage
- `POST /track`
- `GET /summary/today`
- Basic popup
- Basic dashboard

Stubbed for later:

- Discord alerts
- Category detection
- Productivity scoring
- Limits and focus blocking logic

## Run shape

1. Install workspace dependencies with `npm install`.
2. Build the extension with `npm run build -w extension`.
3. Build the backend with `npm run build -w platform/backend`.
4. Start the backend with `npm run start -w platform/backend`.
5. Load `extension/` as an unpacked extension in Chrome.
6. Open `http://localhost:8787` for the dashboard.
