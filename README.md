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

Environment (`web/.env.local`, see `web/.env.example`):

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token. Without it, `npm run dev` keeps the video in the browser tab instead of uploading.
- `WORKER_URL`: worker base URL, for example `http://127.0.0.1:8000`. Without it, `/api/analyze` returns the sample report.

## Worker (`worker/`, FastAPI)

```bash
cd worker
uv sync
uv run --env-file .env uvicorn main:app --reload --port 8000   # GET /health, POST /analyze
uv run pytest
uv run --env-file .env python run_reels.py ../testreels/*.mp4   # per-frame table, spans, checks, cost
```

`POST /analyze` downloads the video from Vercel Blob (only `https://*.public.blob.vercel-storage.com`, up to 100 MB and 90 s), samples it at 2 fps with ffmpeg (at most 720 px wide), asks Muse Spark Open about 8 frames per request, merges the answers into a disclosure-label track and runs the checks in `worker/pipeline/rules.py` against the verified ASCI clauses in `worker/pipeline/asci.py`: `label_present` (a 1.3a label, or a caption containing one; "Collab" alone is REVIEW) and `label_duration` (3s for videos of 15s or less, a third of the length up to 2 minutes, measured as the longest unbroken hold; when that is within half a second of the requirement, the label's edges are re-read at 10 fps, and edge frames that can't be read make it REVIEW "Within measurement margin"). A frame the model gives no parseable answer for counts as unknown, not absent: a check the unknown frames could change is REVIEW. `spoken_disclosure` is INFO "Audio not checked yet." (never FAIL: ASCI requires it only for live streams and audio) and reports carry `audio_checked: false` until the audio step exists. Report screenshots: `docs/screenshots/`. Needs `ffmpeg` and `ffprobe` on the PATH.

Environment (`worker/.env`, see `worker/.env.example`):

- `PROVIDER`: `baseten` (default) or `fireworks`. Both serve Muse Spark Open through the same Chat Completions client (`worker/llm.py`); audio input works on Baseten only.
- `BASETEN_API_KEY`: used with the model slug `meta-models/muse-spark-open-1026`.
- `FIREWORKS_API_KEY`: used with `accounts/fireworks/models/muse-spark-open`.

## Mock mode

With `WORKER_URL` unset, `/api/analyze` waits 2 seconds and returns `shared/fixtures/mock-report.json` with the uploaded file's name, duration, size and URL swapped in (times scale to the real duration). Every mock report says "Sample report, AI pipeline not connected yet". Clauses in reports, the fixture and the landing copy are quoted from `shared/asci-clauses.json` (ASCI's influencer guideline, 1.2e.I, 1.2e.II, 1.3a and 1.3b, with the PDF link).
