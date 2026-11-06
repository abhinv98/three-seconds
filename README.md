# Three Seconds

Checks a creator's Reel or Short against India's ASCI influencer rules before it goes live, and shows the brand what to change.

On a video of 15 seconds or less, the disclosure label has to stay on screen for 3 seconds. Longer videos, up to 2 minutes, need a third of their length. Three Seconds measures the longest unbroken hold and gives a PASS, FAIL or REVIEW with the ASCI clause.

Live site: https://three-seconds-six.vercel.app

Demo film: https://wnlnrzyc3tkrvsfz.public.blob.vercel-storage.com/demo/three-seconds-demo.mp4

## Try it

Press "Check the Meta sample" on the landing page. It logs you in to a read-only folder with one Reel already checked. The login is public on purpose: `metty.mcmetaface@meta.test`, password `poke-the-metaverse`. The folder isn't run by or affiliated with Meta.

To check your own Reel, make an account, or upload at `/check` without one. There's a daily limit across all visitors: 25 checks, 10 Finer Details reads and 10 brand kit reads.

Two real reports on the same 16s clip: [FAIL](shared/fixtures/sample-report.json) with the label up for 1.8s, and [PASS](shared/fixtures/sample-report-pass.json) with it up for 6.42s.

## How it works

Muse Spark Open on Baseten reads the frames at 2 fps, and at 10 fps around the label's edges when the hold is within half a second of the limit. Muse Voice Transcribe on Meta's Model API handles the speech. Then `worker/pipeline/rules.py` makes the call. There's no model in that step. The clause text is quoted from ASCI's guideline in `shared/asci-clauses.json`.

Claude Opus 5.5 does the reading around the verdict: the brand's site and the web for the brand folder, then a frame a second from the Reel for the Finer Details list of what to change. SAM 3.1 tracks the person, face, hand, logo and product at 15 fps so the Studio can draw over the video, and Claude Haiku 5.5 names the product. None of this can change the verdict.

A 60s Reel took about 64s and $0.23. Tracking a 50s Reel adds about $0.75.

## Known limits

- Instagram adds its Paid partnership tag at posting, so it isn't in the video file. A Reel relying on that tag alone gets a FAIL, and the report says why.
- I haven't measured it against a labelled set of Reels, so there's no accuracy number.
- No PDF export, and uploads aren't deleted automatically.
- SAM 3.1 can match the wrong thing. On the sample Reel, "sunglasses" also matches a glasses icon in a burned-in tag.

## Run it

Web, on http://localhost:3000:

```bash
cd web
npm install
npm run dev
npm test
```

Worker, which needs `ffmpeg` and `ffprobe`:

```bash
cd worker
uv sync
uv run --env-file .env uvicorn main:app --reload --port 8000
uv run pytest
```

Settings are explained in `web/.env.example` and `worker/.env.example`. Leave `WORKER_URL` empty and the web app returns a sample report, so it runs without any model keys.

## Deploy

Two Vercel projects: `three-seconds` (root `web`) and `three-seconds-worker` (root `worker`). Deploy from a clean copy of a commit so only tracked files go up:

```bash
for p in worker web; do rm -rf /tmp/ts-$p && mkdir /tmp/ts-$p && git archive HEAD | tar -x -C /tmp/ts-$p; done
cp -R worker/.vercel /tmp/ts-worker/ && cp -R .vercel /tmp/ts-web/
vercel deploy --prod --cwd /tmp/ts-worker
vercel deploy --prod --cwd /tmp/ts-web
```
