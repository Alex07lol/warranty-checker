# Deploying WarrantyVault for free

The whole app — Express API **and** the frontend (served from `public/`) — is a
single long-running Node process, so it deploys to **one free web service**.
The frontend calls the API at the relative path `/api/v1`, so no CORS config
or code changes are needed.

## Free stack (everything $0)

| Piece | Provider | Notes |
|---|---|---|
| Web service (Node 20+) | **Render** | Free tier: 512 MB RAM / 0.1 vCPU, free forever, no card |
| Database (MongoDB) | **MongoDB Atlas M0** | Already configured (`warrantyvault_db`) |
| File storage / CDN | **Cloudinary** | Already configured |
| Store photos | **Google Places API** | Free monthly quota |

## Prerequisites

1. This repo pushed to GitHub (done — `Alex07lol/warranty-checker`).
2. Atlas connection string (the `MONGO_URI` from `API/backend/.env`).
3. Cloudinary `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET`.
4. A `JWT_SECRET` **at least 32 characters** (the app refuses to boot in
   production with a shorter one).

## Option A — One-click Blueprint (recommended)

`render.yaml` at the repo root describes the service. From
[render.com](https://render.com):

1. **New → Blueprint → pick this repo** → Apply.
2. Render provisions the `warrantyvault` web service with the build/start
   commands and non-secret env vars already set.
3. Fill in the secrets under **Dashboard → warrantyvault → Environment**:

| Key | Example value |
|---|---|
| `MONGO_URI` | `mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net` (db name `warrantyvault_db` is hardcoded) |
| `JWT_SECRET` | any random string ≥ 32 chars (e.g. `openssl rand -hex 32`) |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | from Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | from Cloudinary dashboard |
| `CLIENT_URL` | your Render URL (e.g. `https://warrantyvault.onrender.com`) or `*` |

4. **Manual Deploy → Deploy latest commit** (or wait for auto-deploy).
5. Open the live URL → should show the app login screen.

## Option B — Manual service

1. **New → Web Service** → connect the repo.
2. **Root directory:** `API/backend`
3. **Build command:** `npm install`
4. **Start command:** `node src/server.js`
5. **Instance type:** Free
6. Set the same env vars as above (`PORT` is injected by Render — don't set it).

## Verifying

- `GET <url>/` → `{ "success": true, "message": "WarrantyVault API" }`
- Register a user, add a product, upload a receipt PDF and scan it (OCR runs
  in-process — first scan after a cold start takes longer because tesseract
  downloads `eng.traineddata` once).

## Free-tier caveats

- **Sleeping:** Render free services sleep after ~15 min of inactivity and take
  ~1 min to wake. The daily midnight **notification cron** (`node-cron` in
  `server.js`) only runs while the service is awake.
  - **Keep-alive (free):** add an [UptimeRobot](https://uptimerobot.com) free
    monitor hitting the site every 5 min. Render's free quota is
    ~750 instance-hours/month ≈ a 24/7 instance, so an always-awake service
    stays within the free tier and the cron fires normally.
- **Memory:** 512 MB is fine for single-user OCR; heavy concurrent scans could
  exhaust it. Keep uploads small (the API caps files at 5 MB).
- **No persistent disk:** tesseract's language data is re-downloaded after each
  cold start. For snappier cold-start scans you can vendor `eng.traineddata`
  into the repo and point tesseract at it via `langPath`.

## When you outgrow free

- **Always-on + reliable cron:** Render Starter (~$7/mo) removes the sleep.
- **Bigger OCR headroom:** Oracle Cloud Always Free VM (4 ARM cores / 24 GB
  RAM, free forever) with the app behind nginx/systemd.
