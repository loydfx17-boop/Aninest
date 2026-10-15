# AniNest
React-free single-page frontend (`public/index.html`) + Node/Express + PostgreSQL.

## Run
1. Install Node 20+ and PostgreSQL.
2. `createdb aninest`
3. `cp .env.example .env` and edit it.
4. `npm install`
5. `npm run db` (creates tables)
6. `npm start` then open http://localhost:3000

## API
- GET  /api/anime/trending | /search?q= | /:id   (AniList metadata, cached 10 min)
- POST /api/auth/register | /login               -> { token }
- GET/PUT/DELETE /api/watchlist[/:animeId]       (Bearer token)
- GET/PUT /api/progress                          (Bearer token)

Video: the player plays files you own or are licensed to distribute (local file picker + .vtt).
Episode screen links to official streaming services.

## Android
**Option A - install as an app (PWA):** deploy the server to any HTTPS host (Render, Railway, Fly.io), open the URL in Chrome on Android, menu > Install app.

**Option B - real APK (Capacitor):**
1. Deploy the server (or use `http://10.0.2.2:3000` on the emulator) and put its URL in `public/config.js`.
2. `npm install`
3. `npx cap add android` then `npx cap sync android`
4. `npx cap open android` -> Android Studio -> Build > Build APK(s).

## Build the APK in the cloud (no Android Studio)
1. Create a free GitHub repo and upload this whole project (including the hidden `.github` folder).
2. Repo > Settings > Secrets and variables > Actions > Variables: add `API_URL` = your deployed server URL (https://...).
3. Actions tab > "Build Android APK" > Run workflow.
4. When it finishes (about 5 min), download the `AniNest-apk` artifact, unzip, and install `app-debug.apk` on your phone (allow "install unknown apps").
