# Three Seconds

## Web (`web/`, Next.js)

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run lint
npm test           # validates the fixture against shared/report.schema.json
npm run build
```

Routes: `/` landing page, `/check` upload tool, `/report/[id]` report (`/report/sample` plays the sample Reel in `web/public/sample`).

Accounts: `/sign-in` (email and password, Better Auth), `/onboarding` (brand or creator; brands get a folder), `/dashboard` (Overview, Check a Reel, Reels, Brands or Creators), `/join/[code]` (a brand's invite for creators) and `/invite/[token]` (a creator's invite for a brand). Accounts, folders, connections and checked Reels live in SQLite through the libSQL client: Turso when deployed, a file in `web/.data` locally (`web/src/lib/db.ts`; tables are created on first run). A checked Reel's video goes straight from the browser to Vercel Blob (`/api/upload` issues the token), and `/api/reels` checks it there. A creator sees their own Reels; a brand sees its own checks and the Reels creators send it (`canSee` in `web/src/lib/account.ts`).

Environment (`web/.env.local`, see `web/.env.example`):

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token, set when the Blob store is connected to the Vercel project. Without it, `/check` keeps the video in the browser tab in dev, and the dashboard's Check a Reel can't upload.
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: the Turso database, set by the Vercel Marketplace integration for Production. Unset locally, so dev uses `web/.data`.
- `BETTER_AUTH_SECRET`: signs sessions. Required deployed.
- `WORKER_TOKEN`: the secret the deployed worker requires on every check (the same value in both Vercel projects). Leave it unset locally.
- `WORKER_URL`: worker base URL, for example `http://127.0.0.1:8000`. Without it, `/api/analyze` returns the sample report.
- With `WORKER_URL` set but no Blob token (local dev), `/check` posts the video's bytes to `/api/analyze-local`, which streams them to the worker's `POST /analyze-upload`. Start the worker with `ALLOW_UPLOADS=1` in `worker/.env` for that; both are off outside development.
- `DEV_ORIGINS`: dev only, extra hostnames (a LAN or Tailscale address, comma-separated) allowed to open the dev server from another device.

## Worker (`worker/`, FastAPI)

```bash
cd worker
uv sync
uv run --env-file .env uvicorn main:app --reload --port 8000   # GET /health, POST /analyze
uv run pytest
uv run --env-file .env python run_reels.py ../testreels/*.mp4   # per-frame table, spans, checks, cost
```

`POST /analyze` downloads the video from Vercel Blob (only `https://*.public.blob.vercel-storage.com`, up to 100 MB and 90 s), samples it at 2 fps with ffmpeg (at most 720 px wide), asks Muse Spark Open about 8 frames per request, merges the answers into a disclosure-label track and runs the checks in `worker/pipeline/rules.py` against the verified ASCI clauses in `worker/pipeline/asci.py`: `label_present` (a 1.3a label, or a caption containing one; "Collab" alone is REVIEW) and `label_duration` (3s for videos of 15s or less, a third of the length up to 2 minutes, measured as the longest unbroken hold; when that is within half a second of the requirement, the label's edges are re-read at 10 fps, and edge frames that can't be read make it REVIEW "Within measurement margin"). A frame the model gives no parseable answer for counts as unknown, not absent: a check the unknown frames could change is REVIEW. While the frames are read, the audio track goes to Muse Voice Transcribe on Meta's Model API (`worker/meta_api.py`, `worker/pipeline/transcribe.py`); each turn is split into sentences with estimated times and a language tag from its script. `spoken_disclosure` is PASS, with about when it was said, when a line says "sponsored", "paid partnership", "collaboration", "this is an ad" or a Hindi equivalent (a negation next to it cancels it), and INFO otherwise (never FAIL: ASCI requires it only for live streams and audio). `label_language` (1.3b) passes an English label on any ad and a Hindi one when the speech is Hindi or Hinglish; a Hindi label over English speech is REVIEW. Without `META_API_KEY`, or when transcription fails, reports carry `audio_checked: false` and the label checks stand alone. Report screenshots: `docs/screenshots/`. Needs `ffmpeg` and `ffprobe` on the PATH; on Vercel, `worker/build.py` puts a pinned static build in `worker/bin`.

Environment (`worker/.env`, see `worker/.env.example`):

- `PROVIDER`: `baseten` (default) or `fireworks`. Both serve Muse Spark Open through the same Chat Completions client (`worker/llm.py`); audio input works on Baseten only.
- `BASETEN_API_KEY`: used with the model slug `meta-models/muse-spark-open-1026`.
- `FIREWORKS_API_KEY`: used with `accounts/fireworks/models/muse-spark-open`.
- `META_API_KEY`: Meta Model API key, for Muse Voice Transcribe ($0.18 per hour of audio). Every checked video's audio goes to Meta; on free credits, check only public Reels and your own test clips.
- `WORKER_TOKEN`: when set, `/analyze` and `/analyze-upload` answer only requests with `Authorization: Bearer <token>`. Deployed on Vercel without it, the worker refuses every check.

## Deploy (Vercel)

Two projects in the same team, both in `iad1` with Fluid compute:

- `three-seconds`: Next.js, root directory `web` (it builds `../shared` too). A public Blob store (`three-seconds-reels`) and a Turso database from the Vercel Marketplace are connected to it. Environment: `ANTHROPIC_API_KEY`, `BETTER_AUTH_SECRET`, `WORKER_TOKEN` (sensitive) and `WORKER_URL` (the worker's production URL). The production domain is public; Vercel Authentication covers only each deployment's own URL.
- `three-seconds-worker`: FastAPI, root directory `worker`, `main.py` with a 300 s limit (`worker/vercel.json`). Its build step (`[tool.vercel.scripts]` in `worker/pyproject.toml`) copies `shared/` into the function and downloads ffmpeg. Environment: `BASETEN_API_KEY`, `FIREWORKS_API_KEY`, `META_API_KEY`, `WORKER_TOKEN` (sensitive) and `PROVIDER`. Vercel Authentication is off; `WORKER_TOKEN` guards it instead.

Deploy from a clean copy of a commit, so only tracked files are uploaded:

```bash
for p in worker web; do rm -rf /tmp/ts-$p && mkdir /tmp/ts-$p && git archive HEAD | tar -x -C /tmp/ts-$p; done
cp -R worker/.vercel /tmp/ts-worker/ && cp -R .vercel /tmp/ts-web/   # the two project links (gitignored)
vercel deploy --prod --cwd /tmp/ts-worker
vercel deploy --prod --cwd /tmp/ts-web
```

## Mock mode

With `WORKER_URL` unset, `/api/analyze` waits 2 seconds and returns `shared/fixtures/mock-report.json` with the uploaded file's name, duration, size and URL swapped in (times scale to the real duration). Every mock report says "Sample report, AI pipeline not connected yet". Clauses in reports, the fixture and the landing copy are quoted from `shared/asci-clauses.json` (ASCI's influencer guideline, 1.2e.I, 1.2e.II, 1.3a and 1.3b, with the PDF link).
