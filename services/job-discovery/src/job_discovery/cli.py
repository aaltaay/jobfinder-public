from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from .runner import run_discovery


def _safe_print(text: str) -> None:
    try:
        print(text)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Job Finder discovery collectors")
    parser.add_argument("--dry-run", action="store_true", help="Collect and filter only; do not ingest")
    parser.add_argument("--no-feeds", action="store_true", help="Skip Remote OK / Remotive")
    parser.add_argument("--profile", type=Path, default=None)
    parser.add_argument("--sources", type=Path, default=None)
    parser.add_argument("--json-out", type=Path, default=None, help="Write summary JSON")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    kwargs: dict = {
        "include_feeds": not args.no_feeds,
        "dry_run": args.dry_run,
    }
    if args.profile:
        kwargs["profile_path"] = args.profile
    if args.sources:
        kwargs["sources_path"] = args.sources

    try:
        summary = asyncio.run(run_discovery(**kwargs))
    except Exception as exc:  # noqa: BLE001
        logging.exception("discovery failed")
        err = str(exc).encode("ascii", errors="replace").decode("ascii")
        print(json.dumps({"success": False, "error": err}), file=sys.stderr)
        return 1

    text = json.dumps(summary, indent=2, default=str, ensure_ascii=True)
    _safe_print(text)
    if args.json_out:
        args.json_out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
