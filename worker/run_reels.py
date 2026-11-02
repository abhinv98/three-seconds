"""Run the pipeline on local videos and print per-frame readings, spans, the transcript, checks and cost.

    uv run --env-file .env python run_reels.py ../testreels/*.mp4

Stops after the first reel that costs more than --max-cost dollars, Muse Spark Open and Meta together, and
prints the Meta credit spent at the end. --reasoning overrides the vision
stage's reasoning effort for this run only (eval), e.g. --reasoning medium.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from pipeline import vision
from pipeline.frames import SAMPLE_FPS
from pipeline.report import analyze_video, cost
from pipeline.rules import timecode
from pipeline.track import spans_where, state


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("videos", nargs="+", type=Path)
    parser.add_argument("--max-cost", type=float, default=0.50)
    parser.add_argument("--reasoning", choices=["low", "medium", "high", "xhigh"], default=vision.REASONING_EFFORT)
    args = parser.parse_args()
    vision.REASONING_EFFORT = args.reasoning

    meta_spent = 0.0
    for video in args.videos:
        start = time.monotonic()
        analysis = analyze_video(video, video.name, str(video))
        seconds = time.monotonic() - start
        report = analysis.report
        print(f"\n=== {video.name}  {report.video.duration_s:.1f}s  {report.video.width}x{report.video.height}", end="")
        print(f"  reasoning={vision.REASONING_EFFORT}")
        print(f"{'t':>6}  {'fps':<3}  {'state':<8}  {'legible':<7}  {'lang':<7}  {'position':<12}  text")
        edge = {id(r) for r in analysis.edge_readings}
        for r in analysis.readings:
            legible = "" if r.legible is None else ("yes" if r.legible else "no")
            rate = "10" if id(r) in edge else "2"
            print(
                f"{r.t:6.1f}  {rate:<3}  {state(r):<8}  {legible:<7}  {r.language:<7}  {r.position:<12}  {r.label_text}"
            )

        [track] = report.tracks
        for name in ("label", "caption", "unlisted", "unknown"):
            spans = spans_where(analysis.readings, {name}, SAMPLE_FPS, report.video.duration_s)
            print(
                f"{name + ' spans:':<16}",
                ", ".join(f"{timecode(s.t_start)}-{timecode(s.t_end)}" for s in spans) or "none",
            )
        print(
            f"first seen {track.first_seen_s}, total {track.total_on_screen_s}s, longest {track.longest_continuous_s}s"
        )
        for line in report.transcript:
            print(f"  {timecode(line.t_start)}-{timecode(line.t_end)}  [{line.lang}]  {line.text}")
        if not report.audio_checked:
            print("  audio not checked")
        for check in report.checks:
            clause = check.clause.code if check.clause else "no clause"
            print(f"  {check.verdict:<6} {check.id:<17} [{clause}] {check.detail}")
        print(f"  verdict: {report.verdict}")

        replies = analysis.replies + analysis.edge_replies
        total = cost(replies)
        tokens_in = sum(r.prompt_tokens for r in replies)
        tokens_out = sum(r.completion_tokens for r in replies)

        def dollars(amount: float | None) -> str:
            return "unknown" if amount is None else f"${amount:.4f}"

        if analysis.edge_readings:
            print(
                f"  edge refinement: {len(analysis.edge_readings)} extra frames at 10 fps,"
                f" {len(analysis.edge_replies)} requests, {dollars(cost(analysis.edge_replies))}"
            )
        meta = analysis.audio.cost_usd
        meta_spent += meta
        print(
            f"  cost {dollars(total)} + Meta ${meta:.4f}  ({len(replies)} requests, {tokens_in:,} in /"
            f" {tokens_out:,} out tokens, {seconds:.1f}s)"
        )
        if total is not None and total + meta > args.max_cost:
            print(f"\nSTOP: {video.name} cost ${total + meta:.2f}, over the ${args.max_cost:.2f} limit.")
            print(f"Meta credit spent: ${meta_spent:.4f}")
            return 2
    print(f"\nMeta credit spent: ${meta_spent:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
