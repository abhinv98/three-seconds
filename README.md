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

Environment (`web/.env.local`, see `web/.env.example`):

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token. Without it, `npm run dev` keeps the video in the browser tab instead of uploading.
- `WORKER_URL`: worker base URL, for example `http://127.0.0.1:8000`. Without it, `/api/analyze` returns the sample report.

## Worker (`worker/`, FastAPI)

```bash
cd worker
uv sync
uv run uvicorn main:app --reload --port 8000   # GET /health, POST /analyze
uv run pytest
```

## Mock mode

There are no AI calls yet. With `WORKER_URL` unset, `/api/analyze` waits 2 seconds and returns `shared/fixtures/mock-report.json` with the uploaded file's name, duration, size and URL swapped in (times scale to the real duration). The worker returns the same fixture. Every report says "Sample report, AI pipeline not connected yet", and every clause is `ASCI-PENDING` until it is verified against the ASCI guideline.
