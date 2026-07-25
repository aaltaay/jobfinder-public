"""Resolve Cursor workspace paths from the repo root (no hardcoded usernames)."""

from __future__ import annotations

import os
from pathlib import Path


def cursor_project_slug(repo_root: Path) -> str:
    """Mirror Cursor's ``.cursor/projects/<slug>`` folder naming for a workspace path."""
    resolved = repo_root.resolve()
    parts = [resolved.drive.rstrip(":").lower(), *resolved.parts[1:]]
    return "-".join(parts)


def cursor_canvas_dir(repo_root: Path) -> Path:
    override = (os.environ.get("JOBFINDER_CURSOR_CANVASES_DIR") or "").strip()
    if override:
        return Path(override)
    return Path.home() / ".cursor" / "projects" / cursor_project_slug(repo_root) / "canvases"
