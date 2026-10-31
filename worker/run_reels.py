"""Run the visual pipeline on local videos and print per-frame readings, spans, checks and cost.

    uv run --env-file .env python run_reels.py ../testreels/*.mp4

Stops after the first reel that costs more than --max-cost dollars. --reasoning overrides the vision
stage's reasoning effort for this run only (eval), e.g. --reasoning medium.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from pipeline import vision
from pipeline.frames import SAMPLE_FPS
from pipeline.report import analyze_video
from pipeline.rules import timecode
from pipeline.track import spans_where, state


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("videos", nargs="+", type=Path)
    parser.add_argument("--max-cost", type=float, default=0.50)
    parser.add_argument("--reasoning", choices=["low", "medium", "high", "xhigh"], default=vision.REASONING_EFFORT)
    args = parser.parse_args()
    vision.REASONING_EFFORT = args.reasoning

    for video in args.videos:
        start = time.monotonic()
        analysis = analyze_video(video, video.name, str(video))
        seconds = time.monotonic() - start
        report = analysis.report
        print(f"\n=== {video.name}  {report.video.duration_s:.1f}s  {report.video.width}x{report.video.height}", end="")
        print(f"  reasoning={vision.REASONING_EFFORT}")
        print(f"{'t':>6}  {'state':<8}  {'legible':<7}  {'lang':<7}  {'position':<12}  text")
        for r in analysis.readings:
            legible = "" if r.legible is None else ("yes" if r.legible else "no")
            print(f"{r.t:6.1f}  {state(r):<8}  {legible:<7}  {r.language:<7}  {r.position:<12}  {r.label_text}")

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
        for check in report.checks:
            clause = check.clause.code if check.clause else "no clause"
            print(f"  {check.verdict:<6} {check.id:<17} [{clause}] {check.detail}")
        print(f"  verdict: {report.verdict}")

        costs = [r.cost_usd for r in analysis.replies]
        cost = None if not costs or None in costs else sum(costs)
        tokens_in = sum(r.prompt_tokens for r in analysis.replies)
        tokens_out = sum(r.completion_tokens for r in analysis.replies)
        cost_text = "unknown" if cost is None else f"${cost:.4f}"
        print(
            f"  cost {cost_text}  ({len(analysis.replies)} requests, {tokens_in:,} in / {tokens_out:,} out tokens,"
            f" {seconds:.1f}s)"
        )
        if cost is not None and cost > args.max_cost:
            print(f"\nSTOP: {video.name} cost ${cost:.2f}, over the ${args.max_cost:.2f} limit.")
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
